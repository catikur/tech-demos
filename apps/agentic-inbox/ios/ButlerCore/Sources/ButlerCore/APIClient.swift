import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum APIError: Error, LocalizedError, Equatable, Sendable {
    case unauthorized
    case http(status: Int, message: String)
    case transport(String)
    case decoding(String)
    case invalidURL

    public var errorDescription: String? {
        switch self {
        case .unauthorized: return "Sign in with Microsoft 365"
        case let .http(status, message): return message.isEmpty ? "HTTP \(status)" : message
        case let .transport(message): return message
        case let .decoding(message): return "Unexpected server payload: \(message)"
        case .invalidURL: return "Invalid server address"
        }
    }
}

/// Thin, testable HTTP layer. Auth is a bearer token (the encrypted session blob the
/// server hands to native clients at `butler://signed-in?token=`).
public final class ButlerAPI: @unchecked Sendable {
    public let baseURL: URL
    private let session: URLSession
    private let lock = NSLock()
    private var _token: String?

    public var token: String? {
        get { lock.lock(); defer { lock.unlock() }; return _token }
        set { lock.lock(); _token = newValue; lock.unlock() }
    }

    public init(baseURL: URL, token: String? = nil, session: URLSession? = nil) {
        self.baseURL = baseURL
        self._token = token
        if let session {
            self.session = session
        } else {
            let cfg = URLSessionConfiguration.default
            cfg.httpShouldSetCookies = false
            cfg.timeoutIntervalForRequest = 60
            #if !canImport(FoundationNetworking)
            cfg.waitsForConnectivity = true
            #endif
            self.session = URLSession(configuration: cfg)
        }
    }

    public static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    public static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    // MARK: request building

    public func url(_ path: String, query: [String: String?] = [:]) throws -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else { throw APIError.invalidURL }
        let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = basePath + path
        let items = query.compactMap { key, value in value.map { URLQueryItem(name: key, value: $0) } }
        components.queryItems = items.isEmpty ? nil : items.sorted { $0.name < $1.name }
        guard let url = components.url else { throw APIError.invalidURL }
        return url
    }

    public func request(_ method: String, _ path: String, query: [String: String?] = [:], body: Data? = nil, accept: String = "application/json") throws -> URLRequest {
        var req = URLRequest(url: try url(path, query: query))
        req.httpMethod = method
        req.setValue(accept, forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return req
    }

    // MARK: JSON verbs

    public func get<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T {
        try await send(request("GET", path, query: query))
    }

    public func post<T: Decodable>(_ path: String, query: [String: String?] = [:], body: (some Encodable)? = Optional<Empty>.none) async throws -> T {
        try await send(request("POST", path, query: query, body: body.map { try Self.encoder.encode($0) }))
    }

    public func postEmpty(_ path: String, query: [String: String?] = [:]) async throws {
        _ = try await send(request("POST", path, query: query)) as OkResponse
    }

    public func patch<T: Decodable>(_ path: String, query: [String: String?] = [:], body: some Encodable) async throws -> T {
        try await send(request("PATCH", path, query: query, body: try Self.encoder.encode(body)))
    }

    public func delete<T: Decodable>(_ path: String, query: [String: String?] = [:]) async throws -> T {
        try await send(request("DELETE", path, query: query))
    }

    public struct Empty: Encodable, Sendable {
        public init() {}
    }

    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await data(for: req)
        try Self.check(response, data: data)
        do {
            return try Self.decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding("\(T.self): \(error)")
        }
    }

    static func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIError.transport("Not an HTTP response") }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if !(200..<300).contains(http.statusCode) {
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIError.http(status: http.statusCode, message: message)
        }
    }

    private struct ErrorBody: Decodable { var error: String? }

    /// Portable replacement for `URLSession.data(for:)` (corelibs Foundation lags on async APIs).
    func data(for req: URLRequest) async throws -> (Data, URLResponse) {
        try await withCheckedThrowingContinuation { cont in
            let task = session.dataTask(with: req) { data, response, error in
                if let error { cont.resume(throwing: APIError.transport(error.localizedDescription)); return }
                guard let response else { cont.resume(throwing: APIError.transport("Empty response")); return }
                cont.resume(returning: (data ?? Data(), response))
            }
            task.resume()
        }
    }

    // MARK: streaming (`text/event-stream`)

    /// Emits each `data:` payload as a String until the connection closes.
    public func stream(_ req: URLRequest) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            let delegate = StreamDelegate(continuation: continuation)
            let streamSession = URLSession(configuration: session.configuration, delegate: delegate, delegateQueue: nil)
            let task = streamSession.dataTask(with: req)
            continuation.onTermination = { _ in
                task.cancel()
                streamSession.invalidateAndCancel()
            }
            task.resume()
        }
    }

    private final class StreamDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
        // URLSession serialises delegate callbacks on its own queue, so plain state is safe here.
        private var parser = SSEParser()
        private let continuation: AsyncThrowingStream<String, Error>.Continuation
        private var failed = false

        init(continuation: AsyncThrowingStream<String, Error>.Continuation) {
            self.continuation = continuation
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                failed = true
                continuation.finish(throwing: http.statusCode == 401 ? APIError.unauthorized : APIError.http(status: http.statusCode, message: ""))
                completionHandler(.cancel)
                return
            }
            completionHandler(.allow)
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            for payload in parser.feed(data) { continuation.yield(payload) }
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            if failed { return }
            if let error, (error as NSError).code != NSURLErrorCancelled {
                continuation.finish(throwing: APIError.transport(error.localizedDescription))
            } else {
                continuation.finish()
            }
        }
    }
}

import Foundation

/// Incremental parser for the server's `data: <json>\n\n` frames.
/// Comments (`: ping`) and blank frames are dropped; partial chunks are buffered.
public struct SSEParser: Sendable {
    private var buffer = ""

    public init() {}

    /// Feed raw bytes; returns every complete `data:` payload found so far.
    public mutating func feed(_ chunk: Data) -> [String] {
        buffer += String(decoding: chunk, as: UTF8.self)
        return drain()
    }

    public mutating func feed(_ text: String) -> [String] {
        buffer += text
        return drain()
    }

    private mutating func drain() -> [String] {
        var out: [String] = []
        while let range = buffer.range(of: "\n\n") {
            let frame = String(buffer[buffer.startIndex..<range.lowerBound])
            buffer.removeSubrange(buffer.startIndex..<range.upperBound)
            let payload = frame
                .split(separator: "\n", omittingEmptySubsequences: false)
                .filter { $0.hasPrefix("data:") }
                .map { line -> String in
                    var s = line.dropFirst("data:".count)
                    if s.hasPrefix(" ") { s = s.dropFirst() }
                    return String(s)
                }
                .joined(separator: "\n")
            if !payload.isEmpty { out.append(payload) }
        }
        return out
    }
}

import ButlerCore
import UIKit
import UserNotifications

/// Holds the latest APNs token until the signed-in session can register it.
enum DeviceTokenBox {
    static var latest: String?
    static var deliver: ((String) async -> Void)?

    static func accept(_ token: String) {
        latest = token
        guard let deliver else { return }
        Task { await deliver(token) }
    }
}

final class PushCoordinator: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            guard ok else { return }
            DispatchQueue.main.async { application.registerForRemoteNotifications() }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        DeviceTokenBox.accept(deviceToken.map { String(format: "%02x", $0) }.joined())
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}

// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ButlerCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ButlerCore", targets: ["ButlerCore"]),
    ],
    targets: [
        .target(name: "ButlerCore", path: "Sources/ButlerCore"),
        .testTarget(
            name: "ButlerCoreTests",
            dependencies: ["ButlerCore"],
            path: "Tests/ButlerCoreTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)

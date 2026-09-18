// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MetaGunuCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "MetaGunuCore", targets: ["MetaGunuCore"])],
    targets: [
        .target(name: "MetaGunuCore"),
        .testTarget(name: "MetaGunuCoreTests", dependencies: ["MetaGunuCore"]),
    ]
)

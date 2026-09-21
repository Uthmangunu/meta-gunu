import Foundation

public struct EndSessionCommandDetector: Sendable {
    private var transcript = ""
    private var lastEndMilliseconds: Double?

    public init() {}

    public mutating func consume(
        delta: String,
        startMilliseconds: Double?,
        endMilliseconds: Double?
    ) -> Bool {
        if let startMilliseconds, let lastEndMilliseconds,
           startMilliseconds - lastEndMilliseconds >= 800 {
            transcript = ""
        }
        transcript += delta
        if let endMilliseconds { lastEndMilliseconds = endMilliseconds }
        return Self.normalize(transcript) == "end session"
    }

    private static func normalize(_ value: String) -> String {
        value
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

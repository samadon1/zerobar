import SwiftUI

@main
public struct ZeroBarFieldApp: App {
    @StateObject private var engine: HybridAIEngine

    public init() {
        HybridAIEngine.configureFirebase()
        _engine = StateObject(wrappedValue: HybridAIEngine())
    }

    public var body: some Scene {
        WindowGroup {
            FieldNodeView(engine: engine)
                .preferredColorScheme(.dark)
        }
    }
}

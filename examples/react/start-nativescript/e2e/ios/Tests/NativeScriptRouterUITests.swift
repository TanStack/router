import XCTest

@MainActor
final class NativeScriptRouterUITests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "com.tanstack.startnativescript")

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    func testNativeStackAndInteractiveBackSwipe() {
        assertVisible("TanStack Native")
        assertVisible("This value came from a TanStack Start server function.", timeout: 20)

        tap("Open Router")
        assertVisible("PATH PARAM + NATIVE STACK")

        tap("Search this topic")
        assertVisible("SEARCH PARAMS + SERVER FUNCTION")
        assertVisible("Results for “TanStack Router”")

        swipeBack()
        assertVisible("PATH PARAM + NATIVE STACK")

        swipeBack()
        assertVisible("ONE ROUTE TREE")
    }

    func testSearchEntriesReuseTheNativeStack() {
        assertVisible("TanStack Native")

        tap("Search native")
        assertVisible("Results for “native”")

        tap("Search Router")
        assertVisible("Results for “router”")

        tap("Search Start")
        assertVisible("Results for “start”")

        tap("Search Router")
        assertVisible("Results for “router”")

        swipeBack()
        assertVisible("Results for “native”")

        swipeBack()
        assertVisible("ONE ROUTE TREE")
    }

    func testRouteBlockerControlsInteractiveBackSwipe() {
        assertVisible("TanStack Native")

        tap("Open Router")
        assertVisible("PATH PARAM + NATIVE STACK")

        tap("Protect back")
        assertVisible("Back protected")

        swipeBack()
        assertVisible("PATH PARAM + NATIVE STACK")
        assertVisible("Back protected")

        tap("Allow back")
        assertVisible("Protect back")

        swipeBack()
        assertVisible("ONE ROUTE TREE")
    }

    private func tap(_ label: String) {
        let element = matchingLabel(label)
        XCTAssertTrue(element.waitForExistence(timeout: 10), "Expected \(label) to be tappable")
        element.tap()
    }

    private func assertVisible(_ label: String, timeout: TimeInterval = 10) {
        XCTAssertTrue(
            matchingLabel(label).waitForExistence(timeout: timeout),
            "Expected \(label) to be visible"
        )
    }

    private func matchingLabel(_ label: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
            .firstMatch
    }

    private func swipeBack() {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5))

        start.press(
            forDuration: 0.05,
            thenDragTo: end,
            withVelocity: .fast,
            thenHoldForDuration: 0
        )
    }
}

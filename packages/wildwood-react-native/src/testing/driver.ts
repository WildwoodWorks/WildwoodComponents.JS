/**
 * The seam between these helpers and whatever the host drives its app with.
 *
 * The web helpers take Playwright's `Page`, because on the web there is one runner worth naming. On
 * React Native there are three, they agree on nothing but `testID`, and one of them cannot call a
 * helper of ours at all:
 *
 *  · **Detox** drives the app out of process. `exists` is `expect(element(by.id(id)).atIndex(0))
 *    .toExist()` in a try/catch and `tap` is `.tap()`. `type` is `.replaceText(value)`, NOT
 *    `.typeText(value)`: `typeText` appends, so a field refilled after a validation error would be
 *    sent the old value with the new one on the end of it, and `type` here is specified to replace.
 *    `text` is `getAttributes().text`, which is iOS-only - Detox has no stock way to read an
 *    element's text on Android - so an adapter that needs it on both checks Detox's current docs
 *    rather than assuming this line still covers the case.
 *  · **React Native Testing Library** renders in process. `queryAllByTestId(id).length > 0` answers
 *    `exists`, and `fireEvent.press` / `fireEvent.changeText` answer `tap` and `type`.
 *  · **Maestro** drives the app from YAML and cannot call into a JS module of ours, so it consumes
 *    the identifier constants as literals (`assertVisible: id: "register"`) and none of the helpers.
 *    That is exactly why `ids.ts` exports strings rather than only functions that return them.
 *
 * So the driver is INJECTED and this package depends on no runner. The reason is the one `poll.ts`
 * gives in `@wildwood/react` for importing Playwright as a type only: a runtime `import detox` here
 * resolves against THIS package's location, and it would make a host that uses one of the other two
 * install a runner it does not want.
 *
 * Every method is async because an out-of-process runner's every answer is a round trip. An
 * in-process adapter just resolves immediately, which costs it nothing.
 *
 * **`text` and `type` are here for the suite, not for us.** The step readers need `exists` and
 * nothing else - `WwStepReader` below says so. The parts deliberately NOT shipped, filling the
 * registration form above all, are written over this same driver, and a host should not have to keep
 * a second one for them.
 *
 * **Scope is the adapter's job, not an argument.** Step ids are bare - `payment`, `failed` - so
 * nothing in the string says which Wildwood surface it belongs to, and a driver addressed by bare id
 * has no way to honour a scope argument. A host mounting two surfaces on one screen builds one
 * driver per surface, matching within the view element that ENCLOSES the step:
 * `by.id('payment').withAncestor(by.id('signup'))` on Detox,
 * `within(screen.getByTestId('signup'))` in React Native Testing Library. That enclosing element is
 * what the views put on screen for exactly this purpose, and `WW_VIEWS` holds the three names to
 * scope by. A host with one surface on screen - which is every host that gives the component a
 * screen of its own - passes an unscoped driver and never thinks about it.
 *
 * **Several elements may carry one id**, and where they do the adapter acts on the first: an
 * `atIndex(0)` on Detox, a `queryAllByTestId(id)[0]` in React Native Testing Library.
 * `disclaimer-accept` is rendered once per pending disclaimer, and the value-built ids name a row
 * wherever that row appears. No step id is ever rendered twice inside one view, which is what the
 * readers in `steps.ts` rely on.
 */
export interface WwDriver {
  /** Is an element carrying this `testID` on screen? False rather than a throw when none is. */
  exists(testID: string): Promise<boolean>;
  /** The element's rendered text, or null when it has none or is not on screen. */
  text(testID: string): Promise<string | null>;
  /** Press the element. */
  tap(testID: string): Promise<void>;
  /** Replace the input's contents with `value`. */
  type(testID: string, value: string): Promise<void>;
}

/**
 * What the step readers actually need, which is one method.
 *
 * A `WwDriver` satisfies this, so a host writes one adapter and passes it everywhere. Spelled out
 * so that a host which only wants to wait on steps is not asked to implement typing and tapping to
 * get them - and so that the signature says which of the four these functions can reach for.
 */
export type WwStepReader = Pick<WwDriver, 'exists'>;

/**
 * How long a waiter waits, and how often it looks.
 *
 * An options object rather than the web helpers' positional `timeout`, because the interval is worth
 * exposing here and is not there: a Playwright locator read is local to the browser, while a probe
 * over a Detox bridge is a round trip whose cost a host on a slow emulator may want to space out.
 */
export interface WwWaitOptions {
  /** Default 30_000, the same as the web helpers' signup waiters. */
  timeoutMs?: number;
  /**
   * Default 100. The same as the web's, and a floor rather than a period: an out-of-process driver's
   * own round trip is usually the larger half of a cycle.
   */
  intervalMs?: number;
}

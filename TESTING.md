# Testing

## Unit and syntax checks

Requires Node.js with the built-in test runner.

```sh
npm test
npm run check
```

Unit tests cover settings defaults and bounds, distinct initiative levels, player agency, pacing constraints, token estimates, duplicate detection, and generation-type filtering.

## Browser checks

Requires Playwright and an available Chromium or Chrome installation.

```sh
npm run test:browser
```

Set `PLAYWRIGHT_MODULE` to use an existing Playwright module or `CHROME_PATH` to select a Chrome executable.

The test serves a fixture on `127.0.0.1` and loads the extension's actual modules and stylesheet in an isolated browser profile. It checks startup before and after app readiness, floating-panel interaction without a toolbar dependency, mouse and touch dragging, edge docking, position persistence, interrupted animations, reduced motion, keyboard and outside-click dismissal, native drawer coordination, slider interaction, persisted settings, injection parameters, chat switching, quiet-task isolation, duplicate detection, manager-based and hook-based cleanup, renamed installation folders, and phone, landscape, and desktop layouts.

The fixture uses a simulated SillyTavern context and local storage. It does not verify the actual server settings API, provider requests, or model behavior.

### SillyTavern 1.13.5 source interfaces

Set `ST_SOURCE_DIR` to a directory containing `package.json`, `script.js`, `events.js`, `eventemitter.js`, `utils.js`, `style.css`, and `jquery-3.5.1.min.js` from the official SillyTavern `1.13.5` tag, then run the browser checks. These files correspond to the upstream package metadata, `public/script.js`, `public/scripts/events.js`, `public/lib/eventemitter.js`, `public/scripts/utils.js`, `public/style.css`, and `public/lib/jquery-3.5.1.min.js`.

This mode uses the upstream version comparison, event definitions, event emitter, prompt injection function, toolbar styles, and native drawer handlers. It checks that 1.13.5 accepts the manifest and initializes the extension both before and after `APP_READY`, without requiring lifecycle hooks. It is an interface test, not a running SillyTavern server or model session.

## Manual acceptance

1. Install in SillyTavern and open a character chat. Confirm that the floating compass button appears near the right screen edge and the panel starts closed. Open it and confirm level 3.
2. Drag the button with a mouse and a touch screen. Confirm that it docks to the nearest edge without accidentally opening the panel. Refresh and confirm its position persists. With keyboard focus on the button, test arrow keys and Home.
3. Open and close repeatedly, including before an animation finishes. Close with the button, an outside click, and Escape. Open another toolbar drawer and confirm the panel closes. Enable reduced motion in the system settings and confirm a short fade replaces the scaling animation. Resize the screen and open the mobile keyboard; keep the button and panel within the visible area.
4. Change the level and enable state, refresh, and confirm both settings persist.
5. Inspect the prompt preview. Change the level and supplement option and check that the preview updates.
6. Send a story-generation request and inspect the final prompt: the extension marker should occur once when enabled and be absent when disabled.
7. Repeat with regeneration, swipes, continuation, and a different chat. Check that injections do not accumulate.
8. In group chats, check each NPC's actual request. Confirm that quiet background requests exclude the injection.
9. Compare levels 1, 3, and 5 using the same scene. Assess NPC initiative, causal consistency, pacing, and the user's opportunity to respond.
10. Disable or uninstall the extension and refresh. Confirm that the control and injection are removed and presets are unchanged.

Live checks use the connected model and its normal token allowance. Model behavior, provider tokenization, theme compatibility, and interactions with other extensions require testing in the target installation.

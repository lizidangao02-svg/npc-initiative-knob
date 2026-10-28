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

The test serves a fixture on `127.0.0.1` and loads the extension's actual modules and stylesheet in an isolated browser profile. It checks startup before and after app readiness, slider interaction, persisted settings, injection parameters, chat switching, quiet-task isolation, duplicate detection, manager-based and hook-based cleanup, renamed installation folders, and a 375px layout.

The fixture uses a simulated SillyTavern context and local storage. It does not verify the actual server settings API, provider requests, or model behavior.

### SillyTavern 1.13.5 source interfaces

Set `ST_SOURCE_DIR` to a directory containing `package.json`, `script.js`, `events.js`, `eventemitter.js`, and `utils.js` from the official SillyTavern `1.13.5` tag, then run the browser checks. These files correspond to the upstream package metadata, `public/script.js`, `public/scripts/events.js`, `public/lib/eventemitter.js`, and `public/scripts/utils.js`.

This mode uses the upstream version comparison, event definitions, event emitter, and prompt injection function. It checks that 1.13.5 accepts the manifest and initializes the extension both before and after `APP_READY`, without requiring lifecycle hooks. It is an interface test, not a running SillyTavern server or model session.

## Manual acceptance

1. Install in SillyTavern and open a character chat. Confirm that the slider defaults to level 3.
2. Change the level and enable state, refresh, and confirm both settings persist.
3. Inspect the prompt preview. Change the level and supplement option and check that the preview updates.
4. Send a story-generation request and inspect the final prompt: the extension marker should occur once when enabled and be absent when disabled.
5. Repeat with regeneration, swipes, continuation, and a different chat. Check that injections do not accumulate.
6. In group chats, check each NPC's actual request. Confirm that quiet background requests exclude the injection.
7. Compare levels 1, 3, and 5 using the same scene. Assess NPC initiative, causal consistency, pacing, and the user's opportunity to respond.
8. Disable or uninstall the extension and refresh. Confirm that the control and injection are removed and presets are unchanged.

Live checks use the connected model and its normal token allowance. Model behavior, provider tokenization, theme compatibility, and interactions with other extensions require testing in the target installation.

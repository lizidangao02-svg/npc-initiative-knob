# NPC Initiative Knob

Adjust NPC initiative and story pacing with a **1–5 slider** in a toolbar dropdown. Click the compass icon in the top toolbar to open it. The default level is **3 — Moderate initiative**.

The extension adds temporary narrative guidance to story-generation requests. It saves settings, provides an enable switch and prompt preview, and estimates the additional input tokens. It does not rewrite presets or send messages automatically.

## Installation

Requires **SillyTavern 1.13.5 or later**.

1. Open **Extensions → Install extension** in SillyTavern.
2. Paste this repository URL:
   [https://github.com/lizidangao02-svg/npc-initiative-knob](https://github.com/lizidangao02-svg/npc-initiative-knob)
3. Install, refresh the page, and open a character chat.

For manual installation, extract the extension into `public/scripts/extensions/third-party/npc-initiative-knob/` inside the SillyTavern server directory. `manifest.json` must be directly inside that folder. For Docker or remote servers, install into the corresponding server storage, not the device used to view the chat.

No build step, Extras server, or additional API key is required.

## Usage

- Click the compass icon in the top toolbar to open the panel. Click again, click outside, or press Escape to close it. The panel starts closed; closing it does not disable prompt injection.
- Enable or disable the extension with the checkbox beside the slider.
- Click, drag, or use the arrow keys to select a level.
- Expand the settings section to inspect the active prompt and token estimate.
- Keep the supplement option enabled when using an existing narrative preset. Disable it to include basic NPC motivation and scene-progression guidance.
- Settings persist across refreshes and apply to all characters and chats in the current account.
- Changes affect the next request. An ongoing response is unaffected.

| Level | Behavior |
| --- | --- |
| 1 — Reactive | Respond to the user; offer only a subtle observation or natural question when the scene stalls. |
| 2 — Light initiative | Occasionally volunteer a relevant detail, small request, or low-pressure opening. |
| 3 — Moderate initiative | Pursue short-term NPC goals and advance existing threads at natural pauses or when exchanges repeat without progress. |
| 4 — Active progression | Take purposeful action and let established plans produce manageable consequences. |
| 5 — Strong initiative | Maintain momentum through NPC goals, competing interests, and consequences while allowing the user to react. |

All levels preserve the user's control over their character and respect established character and world rules. Event timing depends on the model's interpretation of the context; the extension does not force an event every N turns or run NPCs in the background.

## Token usage

Estimates below include the complete injected prompt with the supplement option enabled.

| Level | Additional input tokens per story-generation request, approximately | Rough range |
| --- | ---: | ---: |
| 1 | 258 | 206–343 |
| 2 | 253 | 202–337 |
| 3 | 277 | 222–369 |
| 4 | 281 | 225–374 |
| 5 | 288 | 231–384 |

The estimate uses character count divided by 4; the rough range uses division by 5 and 3. This is a heuristic, not a tokenizer measurement or a guaranteed bound. The interface recalculates the estimate when options change.

- Adjusting controls makes no model-generation calls. Disabled mode adds no prompt tokens.
- Normal replies, regeneration, swipes, and continuation each include the prompt again. Ten level-3 requests add approximately 2,770 input tokens.
- Group replies and retries may involve several requests; count each one carrying the prompt.
- Quiet background generation, user impersonation, and unknown generation types are excluded.
- Estimates exclude other prompts, chat history, message formatting, and model output. Higher initiative may affect response length. Caching and provider pricing determine the actual cost.

## Preset compatibility

The default supplement mode reuses an existing narrative engine's event handling and defers to its explicit rules. Conflicting hard rules in a preset can limit the slider's effect.

The extension replaces one prompt slot, using `setExtensionPrompt` at `IN_CHAT`, depth 1, with the `SYSTEM` role. World Info scanning of this prompt is disabled. Character cards, chat messages, Author's Note, and presets are not modified.

If another extension prompt contains the `[NPC Initiative Knob]` marker, this extension pauses its own injection. This check does not detect every semantic conflict in presets or other extensions. Avoid copying the preview into a preset or enabling multiple initiative controllers together.

## Troubleshooting

**Slider missing:** Check the required SillyTavern version, enable the extension, and refresh. For manual installation, check for an extra nested folder. If the top toolbar is unavailable, a collapsible control appears in the extension settings panel.

**Little change in behavior:** Check the enable switch and status, inspect the actual prompt, and send a new request. Model capabilities, presets, and other extensions can affect the result.

**Removal:** Disable or uninstall the extension and refresh. On SillyTavern 1.13.5, disabling in the extension manager clears the injection through the settings event; re-enabling requires a refresh. For manual installations, remove its folder. Existing chat messages remain unchanged.

**Compatibility:** Earlier SillyTavern versions are unverified. Future releases must retain the required context APIs and UI mounting points. Automated tests use a simulated SillyTavern interface; live testing with a connected model is still required.

## Development

```sh
npm test
npm run check
```

Browser checks and manual acceptance steps are described in [TESTING.md](TESTING.md).

Git installations support update notifications and updates through the extension manager. Notifications follow SillyTavern's extension settings. SillyTavern may also update the extension during application updates when automatic extension updates are enabled.

## License

[MIT](LICENSE).

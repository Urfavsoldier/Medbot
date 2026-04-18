# MedBot Chrome Extension

MedBot is a Manifest V3 Chrome Extension that acts as an external RPA-style medical assistant on top of any webpage. It listens for spoken commands from the popup and asks the content script to manipulate the active page DOM.

## Structure

```text
manifest.json
src/
  background/
    background.js
  content/
    actionRouter.js
    proactiveAssistant.js
    contentScript.js
  scheduling/
    smartScheduler.js
  popup/
    popup.html
    popup.css
    popup.js
```

## Install Locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder.

## Example Commands

- `Fill patient name with John Smith`
- `Set diagnosis to acute bronchitis`
- `Click save`
- `Press submit`
- `Open patients`
- `Go to next`
- `Clear notes`

The content script uses labels, placeholders, ARIA labels, nearby text, button text, and link text to locate page elements. This is designed to simulate an RPA assistant for medical systems without integrating directly with any private API.

## DOM Automation

The content script exposes a browser-page RPA API at `window.MedBotRPA`:

```js
await window.MedBotRPA.clickByText("Save");
await window.MedBotRPA.fillField("#complaints", "Headache and weakness");
window.MedBotRPA.findFieldByLabel("Complaints");
await window.MedBotRPA.navigateToTab("Primary exam");
window.MedBotRPA.getActionLog();
```

The automation layer:

- Finds buttons, links, tabs, and menu items by visible text and accessibility labels.
- Fills inputs, textareas, selects, contenteditable fields, and `role="textbox"` controls.
- Falls back from CSS selectors to label/placeholder/nearby text matching.
- Dispatches `input`, `change`, and `blur` events for reactive frameworks.
- Waits for dynamic DOM changes before failing.
- Logs every high-level RPA action to the console and returned command result.

## Action Router

AI JSON is executed by `src/content/actionRouter.js`. The router validates each command, finds the registered handler for `intent`, catches handler errors, and returns a normalized `{ ok, message }` result.

Current intent handlers:

- `fill_medical_form`: fills each medical field separately.
- `open_patient_record`: searches for the patient, then clicks search.
- `navigate_to_document`: switches to the requested document/tab.
- `generate_schedule`: navigates to scheduling and fills known schedule fields.
- `mark_service_completed`: navigates to the service and clicks completed/done.
- `suggest_next_step`: returns the next-step message.

Future intents can be added in `src/content/contentScript.js` by registering another handler:

```js
actionRouter.registerMany({
  new_intent: async (command, context) => {
    return context.rpa.clickByText(command.target);
  }
});
```

## Smart Scheduling

`src/scheduling/smartScheduler.js` provides deterministic scheduling without an LLM:

```js
const schedule = window.MedBotScheduler.generateTreatmentSchedule({
  startDate: "2026-04-20",
  procedures: [
    { name: "Massage", specialty: "rehab", durationMinutes: 35, sessions: 9 },
    { name: "Exercise therapy", specialty: "rehab", durationMinutes: 40, sessions: 9 }
  ],
  specialists: [
    { id: "s1", name: "Dr. A", specialty: "rehab" },
    { id: "s2", name: "Dr. B", specialty: "rehab" }
  ],
  workingHours: {
    start: "09:00",
    end: "17:00",
    weekdays: [1, 2, 3, 4, 5]
  }
});
```

The scheduler:

- Generates 9 working days by default.
- Uses 30-40 minute treatment slots.
- Avoids patient and specialist overlaps.
- Assigns matching specialists by specialty/procedure capability.
- Distributes load by choosing the least-loaded matching specialist.
- Returns `days`, flat `assignments`, `specialistLoad`, and `meta`.

The Action Router uses this module for `generate_schedule`. If a schedule field exists on the page, MedBot fills a readable schedule into it and also returns the structured schedule in the command result.

## Proactive Assistant

`src/content/proactiveAssistant.js` tracks the current workflow step and completed medical fields. It can guide the doctor without a new voice command:

- After medical fields are filled, it checks for missing required exam fields.
- If anamnesis is missing, it suggests: `Вы забыли заполнить анамнез`.
- When the exam is complete, it suggests: `Осмотр заполнен. Сформировать расписание?`
- Suggestions appear as an in-page toast.
- When the popup is open, suggestions are also spoken with speech synthesis.
- Toast actions can route directly into the Action Router, for example generating a schedule.

Context is exposed for debugging:

```js
window.MedBotRPA.proactiveAssistant.getContext();
```

## Voice UX

The popup uses the Web Speech API for real-time speech recognition and speech synthesis:

- Start/Stop listening controls are available in the popup.
- Interim speech is shown live while the doctor is speaking.
- Final recognized text is sent to the AI module.
- The UI shows Listening, Processing, and Idle states with animated indicators.
- The agent speaks short confirmations, for example: `Осмотр заполнен. Создать расписание?`

## Premium Popup UI

The popup is designed as a dark medical-tech assistant console for demos. It includes a glowing listening indicator, AI status panel, voice/AI/RPA pipeline animation, live transcript, and compact action log fed by RPA command results.

## AI Command Processing

The background service worker imports `processCommand(text)` from `src/ai/processCommand.js`. The module sends the doctor's speech or text to an LLM and requires a strict JSON response before the content script receives any action.

Supported providers:

- `openai`
- `claude`

Configure credentials from the extension service worker console or another trusted setup flow:

```js
chrome.storage.local.set({
  "medbot.ai.provider": "openai",
  "medbot.ai.apiKey": "YOUR_API_KEY",
  "medbot.ai.model": "gpt-4o-mini"
});
```

The AI module validates these intents:

- `open_patient_record`
- `navigate_to_document`
- `fill_medical_form`
- `generate_schedule`
- `mark_service_completed`
- `suggest_next_step`

For `fill_medical_form`, only these fields are accepted: `complaints`, `anamnesis`, `objective_status`, `recommendations`, and `procedure_result`.

Granular parsing is enforced in two layers:

- The LLM system prompt requires separate medical fields and forbids returning one combined note block.
- `processCommand(text)` repairs the LLM result with deterministic section parsing from the original speech.

Example:

```js
parseMedicalFields("Жалобы: головная боль. Объективно: слабость. Назначить ЛФК.");
```

Returns:

```json
{
  "complaints": "головная боль",
  "objective_status": "слабость",
  "recommendations": "ЛФК"
}
```

## Notes

- Speech recognition uses Chrome's `webkitSpeechRecognition` API from the popup.
- When AI processing is configured, command text is sent to the selected LLM provider.
- Medical data should only be used in compliant environments with the required user consent and organizational controls.

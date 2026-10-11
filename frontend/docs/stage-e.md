# English UI, shorter introduction and island exploration

Date: 2026-10-10. Historical branch: `codex/minestory-stage-a`. Stages A/B/C/D were preserved. No backend changes, push, merge or commit occurred at that stage.

## Implemented at this stage

- English application copy for the introduction, controls, forms, status, errors, warnings and fallback. Frontend mapping translated legacy Chinese backend errors and dynamic PDF extraction warnings; unknown messages used an English fallback. User input/filenames remained unchanged; system file pickers followed the OS language.
- The tree/start moved closer to the cabin, with matching road and automatic route. Base walk speed stayed 1.25 world units/second; that stage's walk took about 4.18 seconds, plus about 2.4 seconds waking/standing. Skip/direct entry remained.
- Shared indoor/outdoor navigation and state, with two-way doorway travel. Original island tiles bounded exploration; trees, pond/banks, garden, furniture and walls collided while the doorway stayed open. WASD/arrows/ground clicks worked, with camera distance/cutaways and tree-crown fading as needed.
- Forms paused movement; closing cleared keys and restored focus. Door travel neither replayed the introduction nor cleared materials, applications or tasks.

## Browser checks

Production preview at port 5173 exercised start, guest entry, workbench/Esc, Explore island, outdoor A/W, wall blocking, ground walking and re-entry. An `Island round trip` draft survived. A ground click moved the character from (0.42, 3.03) to (-3.37, 2.41). Browser error logs were empty.

The separate SIMULATED fixture on port 5175 checked upload auto-close, retained resume/photo, translated extraction warnings, failed-task updates across a doorway round trip and translated timeout errors. A retry completed with three distinct returned document links. Typing W in forms did not move the character; Esc restored workbench focus and controls.

A simulated 390×844 viewport verified scrolling English workbench forms, no horizontal overflow and usable close controls. The temporary viewport was reset; this was not a physical-phone test.

## Regression

Six reported test entries passed at that stage: introduction timing/duplicates/skip/motion/routes, furniture paths, doorway round trips, shoreline/pond/tree/wall collision and tunnelling, uploads, English error presentation, independent drafts, downloads, polling and focus. Build and whitespace checks passed, with only Windows line-ending notices; no new dependency was added.

## Conditions and remaining limits

Windows desktop Codex in-app browser, normal quality, DPR 1.5, approximately 584×562 default viewport. Concurrent tabs and simulated tasks showed about 37–43 FPS and 272–393 calls; other stages observed about 50–61 FPS. There was no throttling, GPU identification, physical-phone, weak-network or prolonged-load test; these observations are not benchmarks.

Production checks did not submit real personal material or call AI. Simulation established UI/state behavior, not actual file parsing or generation quality. Real DOCX output still needed backend integration.

Accounts, persistent history, model switching and job search were absent at that stage. The island was not expanded, and jumping/dynamic physics were not implemented. Authored collision footprints needed updates when furniture moved. Stage D's pending outdoor exploration was completed here. Later versions may implement features outside these historical notes.

## Screenshots

![English introduction](screenshots/stage-e-intro.jpg)
![Doorway and re-entry](screenshots/stage-e-island.jpg)
![Outdoor exploration](screenshots/stage-e-explore.jpg)
![Return to interior](screenshots/stage-e-interior.jpg)
![English mobile workbench, simulated data](screenshots/stage-e-mobile-workbench.jpg)

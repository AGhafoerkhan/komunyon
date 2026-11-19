# Dashboard card hardening plan

## Goal

Make event cards readable and steady at every supported width and app state. Keep the current compact, fixed-height card and preserve all join, attendance, navigation, and privacy behavior. This work targets the card presentation; it must not change Firebase data or permissions.

## Layout contract

- Keep each card at its current fixed height of 320px and fill its dashboard grid column without changing width behavior.
- Use stable zones for host identity, title and labels, date/status, cancellation note, and the bottom spots/status/action row.
- Keep labels directly under the title. Allow the full supported set of five labels to wrap into a reserved area without touching the title or date.
- Keep long titles and cancellation notes inside their reserved areas with intentional line clamping; the study page remains the place to read the full text.
- Keep the bottom row aligned: spots/status on the left and the participant action on the right. Reserve enough space so `Waiting for approval`, `Join`, and joined/host states do not overlap or move the row.
- Preserve the card name privacy rule: first initial plus last name on cards, including long or multi-part names.
- Keep the whole card link and the join action independently keyboard accessible; clicking Join must not navigate the card.

## Boundary matrix

Check these states with deterministic fixture data rather than changing live studies:

| Boundary | Cases |
| --- | --- |
| Width | 320px phone, 375px phone, 640px narrow tablet, 768px tablet, 1024px desktop, and a wide desktop viewport |
| Text | 6-character title, 120-character title, long host first/last names, and a two-line cancellation message |
| Labels | no labels, one label, and all five labels |
| Schedule | active recurring date, canceled next date with a later active date, one-off upcoming, and past event |
| Capacity | zero attendees, one attendee, full session, and canceled session |
| Viewer | host, approved participant attending/not attending, approved participant not attending the group, pending request, and signed-in visitor |
| Controls | `Join`, `Waiting for approval`, joined state with no card leave control, host `Your study`, and no action for past/canceled states where applicable |

For every fixture, check for clipping outside reserved zones, horizontal overflow, tag/title overlap, action/spot collisions, and unexpected card-height changes.

## Work sequence

1. Capture the current card at phone, tablet, and desktop widths; record the 320px height and existing role-specific behavior as the baseline.
2. Build deterministic card fixtures for the boundary matrix and identify any existing content combinations that exceed the current zones.
3. Refine only the card markup and responsive styles, retaining existing attendance and request handlers. Add a visible `+N` label count only if all five labels cannot fit cleanly in the reserved tag area.
4. Add browser-level layout checks for the matrix, including screenshot checks at key widths and interaction checks for the card link versus Join button. Playwright runs against a development-only fixture page and never connects to production or staging Firebase data.
5. Run the repo typecheck and the new card checks, inspect the staging preview at the same widths, then commit and push the implementation.

## Acceptance criteria

- Cards remain 320px high at all tested widths and keep their grid-column width.
- Title and labels never overlap; all five labels remain represented.
- Date, cancellation state, and next active date are readable without shifting the bottom row.
- Spots/status and action stay aligned for every viewer state; no duplicate or unsafe join/leave action appears.
- Card links, Join requests, and privacy-safe host names keep their current semantics.
- No test uses or mutates live staging or production records.

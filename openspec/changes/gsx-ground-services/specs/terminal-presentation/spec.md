## ADDED Requirements

### Requirement: Ground services appear only when there is something to show

The dashboard SHALL show a ground-services section only while GSX is connected and reporting
at least one service that is under way or has completed this turnaround. Where GSX is absent,
unreachable or reporting nothing, the section SHALL be omitted entirely rather than shown
empty or shown as a fault, so a pilot who does not own GSX sees the frame exactly as it is
today.

#### Scenario: The pilot does not have GSX

- **WHEN** the dashboard is drawn with GSX unavailable
- **THEN** no ground-services section is drawn and no line reports GSX at all

#### Scenario: A turnaround is under way

- **WHEN** boarding is in progress and refuelling has completed
- **THEN** the section is drawn, listing both, and disappears again once the aircraft leaves
  the ground

### Requirement: A service reads as one line, progress included

Each service SHALL be drawn on a single line carrying its name, its state and — where it has
one — its progress, so the whole turnaround can be read at a glance without the section
growing taller than the services running. Progress SHALL be rendered as the figures GSX
supplies rather than as a bar, and a service without progress SHALL show its state alone.

#### Scenario: Boarding with a passenger count

- **WHEN** thirty of one hundred and twenty-two passengers are aboard
- **THEN** the boarding line reports the service, that it is in progress, and `30/122`

#### Scenario: A service with no progress figure

- **WHEN** ground power is connected
- **THEN** its line reports the service and its state, with no progress and no empty
  placeholder

### Requirement: The ground-services section obeys the frame's existing rules

The ground-services section SHALL be drawn within the same constraints as every other part of
the frame: each line exactly as wide as the terminal, legible at the narrowest supported
width, legible with colour disabled, and drawn from box-drawing characters the Windows console
can render. State SHALL be distinguishable without relying on colour alone.

#### Scenario: The terminal is narrow

- **WHEN** the frame is drawn at its minimum supported width with services running
- **THEN** every ground-service line is exactly that wide and remains readable

#### Scenario: Colour is unavailable

- **WHEN** the frame is drawn without colour
- **THEN** a completed service and one in progress remain distinguishable

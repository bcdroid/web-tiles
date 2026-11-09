# Night Drift

A blacked-out supercar drifts through a city at night, seen from above.

## The city

- A 5 by 5 grid of blocks with roads between them, dashed centre lines, and zebra crossings
  at every crossroads. The city is the same every time it loads.
- Each block has a sidewalk and a few dark rooftops with air-conditioning units and some lit
  skylights. Street lamps on the sidewalks throw warm pools of light on the road.
- The car cannot drive through buildings or off the edge of the city; it bounces off and
  loses speed.

## The car

- Matte black body, tinted glass, black wheels, a red LED bar across the back that brightens
  when braking, and headlights that light the road ahead.
- A hard turn at speed, or the handbrake, breaks the rear tyres loose and the car slides
  sideways. Sliding leaves tyre marks that slowly fade, and puffs smoke.
- The camera follows the car, looks a little ahead of it, and pulls back slightly at speed.

## Controls

Click inside the area first so it gets the keyboard.

| Key                   | Does                                   |
|-----------------------|----------------------------------------|
| Up or W               | accelerate                             |
| Down or S             | brake, then reverse                    |
| Left / Right or A / D | steer                                  |
| Space                 | handbrake (start a drift)              |
| R                     | put the car back at the start          |

## Autopilot

- At first, and after 6 seconds with no keys pressed, the car drives itself on a loop round
  four blocks, braking before each corner and drifting through it.
- Pressing any driving key takes over at once.

## Score

- While the car is sliding, a drift counter at the top climbs with how sideways it is.
- When the drift ends cleanly, its points go into the score, and the best single drift is
  shown under the score. Hitting a wall mid-drift loses that drift's points.
- The speed is shown at the top left.

## Files

- `index.html`: the page.
- `style.css`: full-window canvas and the help line.
- `drift.js`: the city, the driving physics, the autopilot, and the drawing.

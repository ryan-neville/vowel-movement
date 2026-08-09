Vowel Movement: Game Requirements SpecificationIn Vowel Movement, players are presented with a fixed 4x4 grid containing 8 consonants and 8 blank spaces. The goal is to drag and drop a limited, daily bank of vowels into the blanks to simultaneously form 4 valid 4-letter words horizontally and 4 valid 4-letter words vertically.

Core Gameplay Mechanics & Rules

Daily Vowel Bank: [ A ] [ A ] [ E ] [ I ] [ O ] [ O ] [ U ] [ U ]

Grid Layout (Example State):
+---+---+---+---+

| S |   | N |   |  -> WORD 1 (Horizontal)
+---+---+---+---+

|   | R |   | T |  -> WORD 2
+---+---+---+---+

| L |   | C |   |  -> WORD 3
+---+---+---+---+

|   | M |   | P |  -> WORD 4
+---+---+---+---+

  |   |   |   |
  V   V   V   V
 W1  W2  W3  W4 (Vertical)
The Matrix Constrains: The grid consists of exactly 16 cells (4x4). Every row forms a word; every column forms a word.
Static Daily Puzzle: Every player worldwide gets the exact same layout of 8 consonants and the exact same bank of 8 vowels based on the current date.
The Vowel Inventory: Vowels are treated as physical tokens. If the day's bank has two "A" tokens, the player cannot use three "A"s. Placing a vowel decreases the available inventory count.
Win Condition: The game is won when all 8 blanks are filled, the vowel bank is empty, and all 8 formed words (4 rows, 4 columns) exist in the dictionary.
Loss Condition: There is no turn limit or failure state. The challenge is purely optimization and logic, similar to Sudoku.

Functional Implementation Stories
1. Daily Deterministic Seed Generation
As a static web app developer,
I want the game state to be derived entirely from the user's local calendar date,
So that I do not need a backend database to sync the "Puzzle of the Day" across global users.

Acceptance Criteria:
A utility function takes the current date string (YYYY-MM-DD) and converts it into a numeric seed.
The seed initializes a pseudo-random number generator (PRNG) to select a pre-validated 4x4 matrix from a static JSON dataset.
Changing the system clock to tomorrow successfully updates the puzzle state.

2. Vowel Bank Inventory State
As a player,
I want to see exactly how many of each vowel (A, E, I, O, U) I have left to spend,
So that I don't plan a word layout using letters I do not own.
Acceptance Criteria:
The vowel bank displays an integer counter next to or on top of each vowel token.
Dragging a vowel into the grid decrements its inventory count.
Removing a vowel from the grid increments its inventory count back.
If a vowel count reaches 0, its token UI component becomes visually disabled and un-draggable.

3. Drag-and-Drop Interaction Loop
As a mobile and desktop player,
I want to seamlessly drag vowels from the bank into grid spaces, or move vowels already placed on the grid,
So that testing word combinations feels fluid and intuitive.
Acceptance Criteria:
Grid cells containing consonants are locked and reject drop events.
Blank cells accept dropped vowel tokens.
Clicking/tapping a placed vowel returns it directly to the vowel bank.
Supports pointer events (PointerEvents) or standard HTML5 Drag and Drop APIs to ensure compatibility with both mobile touchscreens and desktop mice.

4. Real-Time Intersection Validation
As a player,
I want the game to immediately evaluate if my placed vowels form valid intersecting words,
So that I get instant visual feedback without guessing blindly.
Acceptance Criteria:
The application runs a validation check whenever a vowel is dropped into a cell.
If a row or column becomes fully populated with 4 letters, the app cross-references that string against a static 4-letter word dictionary array.
Rows and columns light up with a subtle Green indicator if they form a valid word, or Red if they are full but invalid.
Partial lines (1-3 letters) remain in a neutral state.

5. Local Persistence & Share Statistics
As a daily player,
I want my current board state to save automatically if I refresh the page, and I want to share my daily win matrix,
So that I don't lose progress and can brag to my friends without spoiling the answers.
Acceptance Criteria:
The matrix layout array and current vowel positions are serialized to localStorage on every state mutation.
Upon a win condition event, a "Share Results" button copies a classic block emoji grid to the clipboard (e.g., 🟩🟩🟩🟩 indicating a perfect grid layout) alongside the puzzle number.

Technical Architecture & Data Structure (React Static Layout)
To keep this entirely static, the game state can be modeled inside a single custom React hook or context provider using this structural design:

typescript

interface GameState {
  puzzleId: string;        // e.g., "2026-08-09"
  consonantGrid: string[]; // Length 16: ['S', '', 'N', '', '', 'R', '', 'T'...]
  playerGrid: string[];    // Length 16: Tracks user-placed vowels, empty strings for blanks
  initialVowels: { [key: string]: number }; // e.g., { A: 2, E: 1, I: 1, O: 2, U: 2 }
  currentVowels: { [key: string]: number }; // Tracks remaining spendable tokens
  isWon: boolean;
}
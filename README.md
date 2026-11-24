# Algorithm Visualization Tool

An interactive web application for visualizing sorting algorithms with step-by-step playback and speed control.

## Features

### Sorting Algorithms
- **Bubble Sort**: Visualize the classic comparison-based sorting algorithm
- **Quick Sort**: Watch the divide-and-conquer algorithm in action
- **Merge Sort**: See how the efficient merge sort algorithm works

### Interactive Controls
- **Play/Pause**: Control the animation playback
- **Step Navigation**: Move forward/backward through sorting steps
- **Speed Control**: Adjust animation speed from slow to fast
- **Array Size**: Change the number of elements to sort (10-40)
- **Reset**: Generate new random arrays

### Visualization Features
- Color-coded elements:
  - Blue: Normal elements
  - Red: Elements being compared
  - Green: Sorted elements
  - Yellow: Pivot element (Quick Sort)
  - Purple: Merging elements (Merge Sort)
- Real-time statistics (comparisons and swaps)
- Step-by-step explanations
- Progress tracking

## How to Use

1. **Select an Algorithm**: Click on one of the three algorithm buttons (Bubble, Quick, or Merge Sort)
2. **Adjust Settings**: 
   - Use the slider to change array size
   - Adjust speed for faster/slower animation
3. **Control Playback**:
   - Click Play to start automatic sorting
   - Use Previous/Next buttons for manual step control
   - Click Reset to generate a new random array
4. **Watch the Visualization**: Observe how elements move and change colors during sorting

## Technical Details

- Built with React, TypeScript, and Tailwind CSS
- Uses Vite for fast development and building
- Responsive design that works on desktop and mobile
- Real-time algorithm state tracking
- Smooth animations and transitions

## Static-site migration (in progress)

A Python 3.11 + Jinja2 rebuild of this app lives in [`site/`](site/README.md). It
renders the same visualization, controls and copy as a pre-rendered static site
with no React or bundler. The React app documented above is still what production
serves on Render, and it remains the canonical source until the staging checks in
[`site/docs/MIGRATION.md`](site/docs/MIGRATION.md) pass.

```bash
python3 -m venv .venv && .venv/bin/pip install -r site/requirements-dev.txt
.venv/bin/python site/build.py          # → site/dist
.venv/bin/python -m pytest site/tests -q
```

## Development

To run the project locally:

```bash
npm install
npm run dev
```

To build for production:

```bash
npm run build
```

## Algorithms Explained

### Bubble Sort
- Time Complexity: O(n²)
- Repeatedly compares adjacent elements and swaps them if they're in the wrong order
- Each pass places the next largest element in its correct position

### Quick Sort
- Time Complexity: O(n log n) average
- Divide and conquer algorithm
- Selects a pivot element and partitions the array around it
- Recursively sorts the sub-arrays

### Merge Sort
- Time Complexity: O(n log n)
- Divide and conquer algorithm
- Divides array into halves, sorts them, then merges back
- Stable sorting algorithm

## License

MIT
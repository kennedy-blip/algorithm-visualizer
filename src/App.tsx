import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, RotateCcw, Zap, FastForward, GitMerge, GitBranch, BarChart3, Settings, ChevronRight, ChevronLeft } from 'lucide-react';

type Algorithm = 'bubble' | 'quick' | 'merge';
type ArrayElement = {
  value: number;
  color: string;
  isComparing: boolean;
  isPivot: boolean;
  isSorted: boolean;
  isMerging: boolean;
};

const generateRandomArray = (size: number): ArrayElement[] => {
  return Array.from({ length: size }, () => ({
    value: Math.floor(Math.random() * 95) + 5,
    color: 'bg-blue-500',
    isComparing: false,
    isPivot: false,
    isSorted: false,
    isMerging: false,
  }));
};

const bubbleSortStep = (arr: ArrayElement[], step: number) => {
  const newArr = [...arr];
  const n = newArr.length;
  
  for (let i = 0; i < n; i++) {
    newArr[i].isComparing = false;
    newArr[i].isSorted = i >= n - step;
  }
  
  if (step < n) {
    for (let j = 0; j < n - step - 1; j++) {
      newArr[j].isComparing = true;
      newArr[j + 1].isComparing = true;
      
      if (newArr[j].value > newArr[j + 1].value) {
        [newArr[j], newArr[j + 1]] = [newArr[j + 1], newArr[j]];
      }
      break;
    }
  }
  
  return newArr;
};

const quickSortStep = (arr: ArrayElement[], step: number, stack: number[][] = []) => {
  const newArr = [...arr];
  
  if (step === 0) {
    stack.push([0, newArr.length - 1]);
  }
  
  if (stack.length > 0) {
    const [low, high] = stack[stack.length - 1];
    
    if (low < high) {
      const pivot = newArr[high];
      pivot.isPivot = true;
      
      let i = low - 1;
      for (let j = low; j < high; j++) {
        newArr[j].isComparing = true;
        if (newArr[j].value < pivot.value) {
          i++;
          [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
      }
      [newArr[i + 1], newArr[high]] = [newArr[high], newArr[i + 1]];
      
      stack.pop();
      stack.push([low, i]);
      stack.push([i + 2, high]);
    } else {
      stack.pop();
    }
  }
  
  return newArr;
};

const mergeSortStep = (arr: ArrayElement[], step: number) => {
  const newArr = [...arr];
  
  if (step < newArr.length) {
    const chunkSize = Math.pow(2, step);
    
    for (let i = 0; i < newArr.length; i += chunkSize * 2) {
      const left = i;
      const mid = Math.min(i + chunkSize, newArr.length);
      const right = Math.min(i + chunkSize * 2, newArr.length);
      
      for (let j = left; j < right; j++) {
        newArr[j].isMerging = true;
      }
      
      let l = left;
      let r = mid;
      const merged = [];
      
      while (l < mid && r < right) {
        newArr[l].isComparing = true;
        newArr[r].isComparing = true;
        
        if (newArr[l].value <= newArr[r].value) {
          merged.push({ ...newArr[l] });
          l++;
        } else {
          merged.push({ ...newArr[r] });
          r++;
        }
      }
      
      while (l < mid) {
        merged.push({ ...newArr[l] });
        l++;
      }
      
      while (r < right) {
        merged.push({ ...newArr[r] });
        r++;
      }
      
      for (let j = 0; j < merged.length; j++) {
        newArr[left + j] = merged[j];
      }
    }
  }
  
  return newArr;
};

export function App() {
  const [algorithm, setAlgorithm] = useState<Algorithm>('bubble');
  const [array, setArray] = useState<ArrayElement[]>(generateRandomArray(20));
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [currentStep, setCurrentStep] = useState(0);
  const [arraySize, setArraySize] = useState(20);
  const [sortHistory, setSortHistory] = useState<ArrayElement[][]>([]);
  const [comparisons, setComparisons] = useState(0);
  const [swaps, setSwaps] = useState(0);
  
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  
  const resetArray = useCallback(() => {
    const newArray = generateRandomArray(arraySize);
    setArray(newArray);
    setCurrentStep(0);
    setComparisons(0);
    setSwaps(0);
    setIsPlaying(false);
    setSortHistory([newArray]);
  }, [arraySize]);
  
  const performStep = useCallback(() => {
    if (currentStep >= arraySize * 2) {
      setIsPlaying(false);
      return;
    }
    
    let newArray: ArrayElement[];
    let newComparisons = comparisons;
    let newSwaps = swaps;
    
    switch (algorithm) {
      case 'bubble':
        newArray = bubbleSortStep(array, currentStep);
        newComparisons += 1;
        if (currentStep < arraySize) {
          for (let i = 0; i < arraySize - currentStep - 1; i++) {
            if (array[i].value > array[i + 1].value) {
              newSwaps += 1;
              break;
            }
          }
        }
        break;
      case 'quick':
        newArray = quickSortStep(array, currentStep);
        newComparisons += arraySize;
        break;
      case 'merge':
        newArray = mergeSortStep(array, currentStep);
        newComparisons += arraySize * Math.log2(arraySize);
        break;
      default:
        newArray = array;
    }
    
    setArray(newArray);
    setCurrentStep(prev => prev + 1);
    setComparisons(newComparisons);
    setSwaps(newSwaps);
    setSortHistory(prev => [...prev, newArray]);
  }, [algorithm, array, currentStep, arraySize, comparisons, swaps]);
  
  useEffect(() => {
    if (isPlaying && animationRef.current === null) {
      animationRef.current = setInterval(() => {
        performStep();
      }, 1000 - speed);
    } else if (!isPlaying && animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, performStep, speed]);
  
  useEffect(() => {
    resetArray();
  }, [algorithm, resetArray]);
  
  const handlePreviousStep = () => {
    if (currentStep > 0 && sortHistory.length > 1) {
      setArray(sortHistory[sortHistory.length - 2]);
      setSortHistory(prev => prev.slice(0, -1));
      setCurrentStep(prev => prev - 1);
    }
  };
  
  const handleNextStep = () => {
    performStep();
  };
  
  const handleSpeedChange = (newSpeed: number) => {
    setSpeed(newSpeed);
  };
  
  const getAlgorithmInfo = () => {
    switch (algorithm) {
      case 'bubble':
        return {
          name: 'Bubble Sort',
          description: 'Repeatedly steps through the list, compares adjacent elements and swaps them if they are in the wrong order.',
          complexity: 'O(n²)',
          icon: <Zap className="w-5 h-5" />,
          color: 'bg-orange-500',
        };
      case 'quick':
        return {
          name: 'Quick Sort',
          description: 'Divide and conquer algorithm that picks an element as pivot and partitions the array around the pivot.',
          complexity: 'O(n log n) average',
          icon: <GitBranch className="w-5 h-5" />,
          color: 'bg-purple-500',
        };
      case 'merge':
        return {
          name: 'Merge Sort',
          description: 'Divide and conquer algorithm that divides the array into halves, sorts them, and merges them back.',
          complexity: 'O(n log n)',
          icon: <GitMerge className="w-5 h-5" />,
          color: 'bg-green-500',
        };
    }
  };
  
  const info = getAlgorithmInfo();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 md:mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Algorithm Visualization
              </h1>
              <p className="text-gray-400 mt-2">Visualize sorting algorithms step by step</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg">
                <BarChart3 className="w-5 h-5" />
                <span className="text-sm font-medium">Comparisons: {comparisons}</span>
                <span className="text-sm font-medium ml-4">Swaps: {swaps}</span>
              </div>
            </div>
          </div>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Algorithm Selection */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Algorithm Selection
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {(['bubble', 'quick', 'merge'] as Algorithm[]).map((algo) => (
                  <button
                    key={algo}
                    onClick={() => setAlgorithm(algo)}
                    className={`p-4 rounded-xl transition-all duration-300 ${
                      algorithm === algo
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg shadow-blue-500/20'
                        : 'bg-gray-700/50 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      {algo === 'bubble' && <Zap className="w-6 h-6" />}
                      {algo === 'quick' && <GitBranch className="w-6 h-6" />}
                      {algo === 'merge' && <GitMerge className="w-6 h-6" />}
                      <span className="text-sm font-medium capitalize">{algo} Sort</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Algorithm Info */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-3 rounded-lg ${info.color}`}>
                  {info.icon}
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{info.name}</h3>
                  <p className="text-sm text-gray-400">Time Complexity: {info.complexity}</p>
                </div>
              </div>
              <p className="text-gray-300">{info.description}</p>
            </div>
            
            {/* Array Controls */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Array Controls</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Array Size: {arraySize}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="40"
                    value={arraySize}
                    onChange={(e) => setArraySize(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>10</span>
                    <span>25</span>
                    <span>40</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Speed: {speed}ms
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="900"
                    step="100"
                    value={speed}
                    onChange={(e) => handleSpeedChange(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Slow</span>
                    <span>Medium</span>
                    <span>Fast</span>
                  </div>
                </div>
                
                <button
                  onClick={resetArray}
                  className="w-full py-3 px-4 bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 font-medium"
                >
                  <RotateCcw className="w-5 h-5" />
                  Generate New Array
                </button>
              </div>
            </div>
          </div>
          
          {/* Main Visualization Area */}
          <div className="lg:col-span-2 space-y-6">
            {/* Visualization Container */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Visualization</h2>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span>Normal</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span>Comparing</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span>Sorted</span>
                  </div>
                </div>
              </div>
              
              {/* Array Visualization */}
              <div className="h-64 md:h-80 bg-gray-900/50 rounded-xl p-6 flex items-end justify-center gap-1 md:gap-2">
                {array.map((element, index) => (
                  <div
                    key={index}
                    className={`flex-1 rounded-t-lg transition-all duration-300 ${
                      element.isComparing
                        ? 'bg-red-500'
                        : element.isPivot
                        ? 'bg-yellow-500'
                        : element.isMerging
                        ? 'bg-purple-500'
                        : element.isSorted
                        ? 'bg-green-500'
                        : 'bg-blue-500'
                    }`}
                    style={{
                      height: `${element.value}%`,
                      minWidth: '8px',
                    }}
                  >
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-xs font-mono">
                      {element.value}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Playback Controls */}
              <div className="mt-8">
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={handlePreviousStep}
                    disabled={currentStep === 0}
                    className="p-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transition-all duration-300"
                  >
                    {isPlaying ? (
                      <Pause className="w-8 h-8" />
                    ) : (
                      <Play className="w-8 h-8" />
                    )}
                  </button>
                  
                  <button
                    onClick={handleNextStep}
                    disabled={currentStep >= arraySize * 2}
                    className="p-3 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  
                  <button
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentStep(0);
                      setArray(sortHistory[0]);
                      setSortHistory([sortHistory[0]]);
                    }}
                    className="p-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-all duration-300"
                  >
                    <SkipBack className="w-6 h-6" />
                  </button>
                  
                  <button
                    onClick={() => {
                      while (currentStep < arraySize * 2) {
                        performStep();
                      }
                    }}
                    className="p-3 rounded-xl bg-gray-700 hover:bg-gray-600 transition-all duration-300"
                  >
                    <FastForward className="w-6 h-6" />
                  </button>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Step: {currentStep}</span>
                    <span>Total Steps: {arraySize * 2}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${(currentStep / (arraySize * 2)) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Step-by-Step Explanation */}
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">Step-by-Step Explanation</h2>
              <div className="space-y-3">
                {algorithm === 'bubble' && (
                  <>
                    <div className="p-4 bg-gray-900/50 rounded-lg">
                      <p className="text-gray-300">
                        <span className="font-semibold text-blue-400">Step {currentStep}:</span>{' '}
                        {currentStep === 0
                          ? 'Initial array generated. Ready to start sorting.'
                          : currentStep < arraySize
                          ? `Comparing adjacent elements. Pass ${currentStep} of ${arraySize}.`
                          : 'Sorting complete! Array is fully sorted.'}
                      </p>
                    </div>
                    <p className="text-sm text-gray-400">
                      Bubble sort works by repeatedly swapping adjacent elements if they are in the wrong order.
                      Each pass through the list places the next largest element in its correct position.
                    </p>
                  </>
                )}
                
                {algorithm === 'quick' && (
                  <>
                    <div className="p-4 bg-gray-900/50 rounded-lg">
                      <p className="text-gray-300">
                        <span className="font-semibold text-purple-400">Step {currentStep}:</span>{' '}
                        {currentStep === 0
                          ? 'Initial array generated. Ready to start quick sort.'
                          : 'Partitioning array around pivot element.'}
                      </p>
                    </div>
                    <p className="text-sm text-gray-400">
                      Quick sort selects a pivot element and partitions the array into two sub-arrays:
                      elements less than the pivot and elements greater than the pivot.
                      The process is recursively applied to the sub-arrays.
                    </p>
                  </>
                )}
                
                {algorithm === 'merge' && (
                  <>
                    <div className="p-4 bg-gray-900/50 rounded-lg">
                      <p className="text-gray-300">
                        <span className="font-semibold text-green-400">Step {currentStep}:</span>{' '}
                        {currentStep === 0
                          ? 'Initial array generated. Ready to start merge sort.'
                          : `Merging sorted sub-arrays. Merge level ${currentStep}.`}
                      </p>
                    </div>
                    <p className="text-sm text-gray-400">
                      Merge sort divides the array into halves until each sub-array has one element,
                      then merges them back together in sorted order.
                      This is a classic divide-and-conquer algorithm.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <footer className="mt-8 pt-6 border-t border-gray-800 text-center text-gray-500 text-sm">
          <p>Algorithm Visualization Tool • Use the controls to visualize sorting algorithms step by step</p>
          <p className="mt-1">Click on algorithm buttons to switch between Bubble Sort, Quick Sort, and Merge Sort</p>
        </footer>
      </div>
    </div>
  );
}
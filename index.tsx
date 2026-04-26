import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { playSound } from './sounds';

interface Task {
  id: number;
  name: string;
  initialCount: number;
  remaining: number;
  x: number;
  y: number;
}

const TaskProgressBar: React.FC<{ tasks: Task[] }> = ({ tasks }) => {
  const totalTasks = useMemo(() => tasks.reduce((sum, task) => sum + task.initialCount, 0), [tasks]);
  const completedTasks = useMemo(() => tasks.reduce((sum, task) => sum + (task.initialCount - task.remaining), 0), [tasks]);

  const progressPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-background">
        <div className="progress-bar-label">Aufgaben erledigt</div>
        <div 
          className="progress-bar-fill" 
          style={{ width: `${progressPercentage}%` }}
          role="progressbar"
          aria-valuenow={progressPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Fortschritt der erledigten Aufgaben"
        ></div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetingTime, setMeetingTime] = useState<number>(60);
  const [sabotageTime, setSabotageTime] = useState<number>(60);
  const [gameTime, setGameTime] = useState<number>(10 * 60); // Default 10 mins in seconds
  const [gameTimer, setGameTimer] = useState<number>(0);
  const [sabotageUses, setSabotageUses] = useState<number>(1);
  const [remainingSabotages, setRemainingSabotages] = useState<number>(1);
  const [currentTaskName, setCurrentTaskName] = useState('');
  const [currentTaskCount, setCurrentTaskCount] = useState<number>(1);
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'finished'>('setup');
  
  const [isMeetingActive, setIsMeetingActive] = useState<boolean>(false);
  const [showMeetingIntro, setShowMeetingIntro] = useState<boolean>(false);
  const [showMeetingOutro, setShowMeetingOutro] = useState<boolean>(false);
  const [meetingTimer, setMeetingTimer] = useState<number>(0);
  const meetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isSabotageActive, setIsSabotageActive] = useState<boolean>(false);
  const [isSabotagePending, setIsSabotagePending] = useState<boolean>(false);
  const [sabotageTimer, setSabotageTimer] = useState<number>(0);
  const sabotageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sabotagePendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sabotageBeepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPostDisarmCooldown, setIsPostDisarmCooldown] = useState<boolean>(false);
  
  const [impostorWin, setImpostorWin] = useState<boolean>(false);
  const [crewmateWin, setCrewmateWin] = useState<boolean>(false);

  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  const [deletableTaskId, setDeletableTaskId] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showShushAnimation, setShowShushAnimation] = useState<boolean>(false);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  const [sabotageCodes, setSabotageCodes] = useState<string[]>([]);
  const [customCodes, setCustomCodes] = useState<string[]>(['', '']);
  const [codesPerSabotage, setCodesPerSabotage] = useState<number>(1);
  const [codesEnteredThisSabotage, setCodesEnteredThisSabotage] = useState<string[]>([]);
  const [currentSabotageCode, setCurrentSabotageCode] = useState('');
  const [sabotageCodeError, setSabotageCodeError] = useState(false);
  const [showValidCodeMessage, setShowValidCodeMessage] = useState<boolean>(false);
  
  const numpadLockRef = useRef(false);
  const [isSetupPanelExpanded, setIsSetupPanelExpanded] = useState(true);

  const centralButtonRef = useRef<HTMLDivElement>(null);


  const isGameInteractionDisabled = gameState !== 'playing' || isMeetingActive || showMeetingIntro || isSabotageActive || isPostDisarmCooldown;

  const handleBackgroundPointerDown = () => {
    if (deletableTaskId !== null) {
        setDeletableTaskId(null);
    }
  };

  useEffect(() => {
    const lockOrientation = async () => {
      try {
        // Fix for TypeScript error: Property 'lock' does not exist on type 'ScreenOrientation'.
        // The lock method is part of the Screen Orientation API but might not be in default TS types.
        // Casting to `any` to bypass the type check, since a runtime check is already present.
        if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
          await (screen.orientation as any).lock('landscape');
        }
      } catch (error) {
        // User requested to remove this warning.
      }
    };
    lockOrientation();
  }, []);

  const adjustTime = (setter: React.Dispatch<React.SetStateAction<number>>, amount: number) => {
    setter(prev => {
        const newTime = prev + amount;
        if (newTime < 0) return 0;
        if (newTime > 90) return 90;
        return newTime;
    });
  };

  const adjustGameTime = (setter: React.Dispatch<React.SetStateAction<number>>, amountInSeconds: number) => {
    setter(prev => {
        const newTime = prev + amountInSeconds;
        if (newTime < 60) return 60; // 1 minute minimum
        if (newTime > 30 * 60) return 30 * 60; // 30 minutes maximum
        return newTime;
    });
  };

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const adjustTaskCount = (amount: number) => {
    setCurrentTaskCount(prev => {
        const newCount = prev + amount;
        if (newCount < 1) return 1;
        if (newCount > 99) return 99;
        return newCount;
    });
  };

  const handleTaskCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInt(e.target.value, 10);
    if (e.target.value === "") {
        setCurrentTaskCount(1);
    } else if (!isNaN(num)) {
        setCurrentTaskCount(num);
    }
  };

  const handleTaskCountBlur = () => {
    setCurrentTaskCount(prev => {
        if (prev < 1) return 1;
        if (prev > 99) return 99;
        return prev;
    });
  };

  const handleTaskCountFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentTaskName.trim() && currentTaskCount > 0) {
      const newTask: Task = {
        id: Date.now(),
        name: currentTaskName.trim(),
        initialCount: currentTaskCount,
        remaining: currentTaskCount,
        x: 50,
        y: 50,
      };
      setTasks([...tasks, newTask]);
      setCurrentTaskName('');
    }
  };

  const handleDeleteTask = (id: number) => {
    setTasks(tasks.filter(task => task.id !== id));
    setDeletableTaskId(null);
  };

  const handleTaskClick = (id: number) => {
    if (isGameInteractionDisabled) return;
    setTasks(
      tasks.map(task => {
        if (task.id === id && task.remaining > 0) {
          return { ...task, remaining: task.remaining - 1 };
        }
        return task;
      })
    );
  };

  const handleStartGame = () => {
    if (tasks.length > 0) {
      playSound('startGame');
      setShowShushAnimation(true);
      setTimeout(() => {
        setShowShushAnimation(false);
        setRemainingSabotages(sabotageUses);
        setGameState('playing');
        setGameTimer(gameTime);
      }, 3000);
    } else {
      alert('Bitte füge zuerst mindestens eine Aufgabe hinzu.');
    }
  };

  const resetGame = () => {
    setTasks(prevTasks => 
      prevTasks.map(task => ({
          ...task,
          remaining: task.initialCount
      }))
    );
    setCurrentTaskName('');
    setCurrentTaskCount(1);
    setGameState('setup');
    setIsMeetingActive(false);
    setShowMeetingIntro(false);
    setShowMeetingOutro(false);
    setIsSabotageActive(false);
    setIsSabotagePending(false);
    setImpostorWin(false);
    setCrewmateWin(false);
    setIsPostDisarmCooldown(false);
    setSabotageUses(1);
    setRemainingSabotages(1);
    setDeletableTaskId(null);
    setShowShushAnimation(false);
    setCurrentSabotageCode('');
    setSabotageCodeError(false);
    setCodesPerSabotage(1);
    setCodesEnteredThisSabotage([]);
    setShowValidCodeMessage(false);
    setGameTime(600);
    setGameTimer(0);
    if(meetingTimerRef.current) clearTimeout(meetingTimerRef.current);
    if(sabotageTimerRef.current) clearTimeout(sabotageTimerRef.current);
    if(sabotagePendingTimerRef.current) clearTimeout(sabotagePendingTimerRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (sabotageBeepIntervalRef.current) {
      clearInterval(sabotageBeepIntervalRef.current);
      sabotageBeepIntervalRef.current = null;
    }
  };
  
  const handleEmergencyClick = () => {
    if (isGameInteractionDisabled || isSabotagePending) return;
    playSound('emergencyMeeting');
    setShowMeetingIntro(true);
  };

  const handleCentralButtonClick = () => {
    if (gameState === 'setup') {
      handleStartGame();
    } else {
      handleEmergencyClick();
    }
  };

  const handleSabotageClick = () => {
    if (isGameInteractionDisabled || remainingSabotages <= 0 || isSabotagePending) return;
    
    setIsSabotagePending(true);

    const delay = Math.random() * 2000 + 8000; // 8-10 seconds delay

    sabotagePendingTimerRef.current = setTimeout(() => {
        setIsSabotagePending(false);
        setIsSabotageActive(true);
        setCodesEnteredThisSabotage([]);
        setSabotageTimer(sabotageTime);
    }, delay);
  };

  const handleNumpadClick = (digit: string) => {
    if (numpadLockRef.current) return;

    if (currentSabotageCode.length < 5) {
      numpadLockRef.current = true;
      setCurrentSabotageCode(prev => prev + digit);
      setTimeout(() => {
        numpadLockRef.current = false;
      }, 100); // Debounce for 100ms to prevent multiple entries
    }
  };
  
  const handleClearCode = () => {
    setCurrentSabotageCode('');
  };
  
  const handleCodeSubmit = () => {
    if (showValidCodeMessage || sabotageCodeError) return;

    if (currentSabotageCode.length !== 5) {
      setSabotageCodeError(true);
      setTimeout(() => {
        setSabotageCodeError(false);
      }, 500);
      return;
    }
    
    const allValidCodes = [...sabotageCodes, ...customCodes.filter(c => c.length > 0)];
    const isValid = allValidCodes.includes(currentSabotageCode);
    const isNew = !codesEnteredThisSabotage.includes(currentSabotageCode);

    if (isValid && isNew) {
      setShowValidCodeMessage(true);
      setTimeout(() => {
        setShowValidCodeMessage(false);
        const newEnteredCodes = [...codesEnteredThisSabotage, currentSabotageCode];
        setCodesEnteredThisSabotage(newEnteredCodes);
        setCurrentSabotageCode('');

        if (newEnteredCodes.length >= codesPerSabotage) {
            setIsSabotageActive(false);
            if (sabotageTimerRef.current) clearTimeout(sabotageTimerRef.current);
            setRemainingSabotages(prev => prev - 1);
            
            const totalRemaining = tasks.reduce((sum, task) => sum + task.remaining, 0);
            if (totalRemaining === 0) {
                setCrewmateWin(true);
                setGameState('finished');
            } else {
                setIsPostDisarmCooldown(true);
                setTimeout(() => {
                    setIsPostDisarmCooldown(false);
                }, 1000);
            }
        }
      }, 1000);
    } else {
      setSabotageCodeError(true);
      setTimeout(() => {
        setSabotageCodeError(false);
        setCurrentSabotageCode('');
      }, 500);
    }
  };

  const handleCustomCodeChange = (index: number, value: string) => {
    const sanitizedValue = value.replace(/[^0-9]/g, '').slice(0, 5);
    const newCustomCodes = [...customCodes];
    newCustomCodes[index] = sanitizedValue;
    setCustomCodes(newCustomCodes);
    localStorage.setItem('customSabotageCodes', JSON.stringify(newCustomCodes.filter(c => c.length > 0)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, taskId: number) => {
    e.stopPropagation();
    setActiveTaskId(taskId);
    if (gameState !== 'setup') return;

    setDeletableTaskId(null);

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      setDraggingTaskId(null); 
      setDeletableTaskId(taskId);
      isDraggingRef.current = false;
    }, 500);

    isDraggingRef.current = true;
    const target = e.currentTarget as HTMLDivElement;
    target.setPointerCapture(e.pointerId);

    const rect = target.getBoundingClientRect();
    dragOffsetRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };
    
    setDraggingTaskId(taskId);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>, taskId: number) => {
    setActiveTaskId(null);
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
    }

    if (isDraggingRef.current) {
        isDraggingRef.current = false;
    } else {
        handleTaskClick(taskId);
    }
    setDraggingTaskId(null);
  };

  useEffect(() => {
    const storedCodes = localStorage.getItem('sabotageCodes');
    let codes: string[];
    if (storedCodes) {
        codes = JSON.parse(storedCodes);
    } else {
        const newCodes = new Set<string>();
        while (newCodes.size < 10) {
            let code = '';
            let lastDigit = -1;
            while (code.length < 5) {
                const digit = Math.floor(Math.random() * 10);
                if (digit !== lastDigit) {
                    code += digit.toString();
                    lastDigit = digit;
                }
            }
            newCodes.add(code);
        }
        codes = Array.from(newCodes);
        localStorage.setItem('sabotageCodes', JSON.stringify(codes));
    }
    setSabotageCodes(codes);

    const storedCustomCodes = localStorage.getItem('customSabotageCodes');
    if (storedCustomCodes) {
        try {
            const parsed = JSON.parse(storedCustomCodes);
            if(Array.isArray(parsed) && parsed.length <= 2) {
                setCustomCodes(parsed.concat(['', '']).slice(0, 2));
            }
        } catch (e) {
            // ignore error, default is fine
        }
    }
  }, []);
  
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (draggingTaskId === null || gameState !== 'setup') return;

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      
      const taskWidth = 100;
      const taskHeight = 100;

      const currentTask = tasks.find(t => t.id === draggingTaskId);
      if (!currentTask) return;

      const currentX_px = (currentTask.x / 100 * window.innerWidth) - taskWidth / 2;
      const currentY_px = (currentTask.y / 100 * window.innerHeight) - taskHeight / 2;

      const desiredX_px = e.clientX - dragOffsetRef.current.x;
      const desiredY_px = e.clientY - dragOffsetRef.current.y;

      type Rect = { left: number; top: number; right: number; bottom: number; };

      const obstacles: Rect[] = [];
      tasks.forEach(task => {
        if (task.id === draggingTaskId) return;
        const centerX = (task.x / 100) * window.innerWidth;
        const centerY = (task.y / 100) * window.innerHeight;
        obstacles.push({
          left: centerX - taskWidth / 2,
          top: centerY - taskHeight / 2,
          right: centerX + taskWidth / 2,
          bottom: centerY + taskHeight / 2,
        });
      });

      if (centralButtonRef.current) {
        obstacles.push(centralButtonRef.current.getBoundingClientRect());
      }

      const isOverlapping = (rect: Rect, obs: Rect) => !(
        rect.right < obs.left ||
        rect.left > obs.right ||
        rect.bottom < obs.top ||
        rect.top > obs.bottom
      );

      let finalX_px = currentX_px;
      let finalY_px = currentY_px;

      // Try to move horizontally
      const targetXRect: Rect = { left: desiredX_px, top: currentY_px, right: desiredX_px + taskWidth, bottom: currentY_px + taskHeight };
      if (!obstacles.some(obs => isOverlapping(targetXRect, obs))) {
        finalX_px = desiredX_px;
      }

      // Try to move vertically, using the new horizontal position.
      // This creates the sliding effect around corners.
      const targetYRect: Rect = { left: finalX_px, top: desiredY_px, right: finalX_px + taskWidth, bottom: desiredY_px + taskHeight };
      if (!obstacles.some(obs => isOverlapping(targetYRect, obs))) {
        finalY_px = desiredY_px;
      }

      const newX_percent = ((finalX_px + taskWidth / 2) / window.innerWidth) * 100;
      const newY_percent = ((finalY_px + taskHeight / 2) / window.innerHeight) * 100;

      if (newX_percent !== currentTask.x || newY_percent !== currentTask.y) {
        setTasks(currentTasks =>
          currentTasks.map(task =>
            task.id === draggingTaskId ? { ...task, x: newX_percent, y: newY_percent } : task
          )
        );
      }
    };

    if (draggingTaskId !== null) {
      window.addEventListener('pointermove', handlePointerMove);
    }
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [draggingTaskId, gameState, tasks]);
  
  useEffect(() => {
    if (tasks.length > 0 && gameState === 'playing' && !crewmateWin && !impostorWin) {
        const totalRemaining = tasks.reduce((sum, task) => sum + task.remaining, 0);
        if (totalRemaining === 0 && !isSabotageActive && !isSabotagePending) {
            setCrewmateWin(true);
            setGameState('finished');
        }
    }
  }, [tasks, gameState, crewmateWin, impostorWin, isSabotageActive, isSabotagePending]);


  useEffect(() => {
    let introTimer: ReturnType<typeof setTimeout>;
    if (showMeetingIntro) {
      introTimer = setTimeout(() => {
        setShowMeetingIntro(false);
        setIsMeetingActive(true);
        setMeetingTimer(meetingTime);
      }, 3000);
    }
    return () => clearTimeout(introTimer);
  }, [showMeetingIntro, meetingTime]);


  useEffect(() => {
    if (isMeetingActive && meetingTimer > 0) {
      meetingTimerRef.current = setTimeout(() => setMeetingTimer(t => t - 1), 1000);
    } else if (meetingTimer === 0 && isMeetingActive && !showMeetingOutro) {
      if(meetingTimerRef.current) clearTimeout(meetingTimerRef.current);
      setShowMeetingOutro(true);
      setTimeout(() => {
        setIsMeetingActive(false);
        setShowMeetingOutro(false);
      }, 2000); // Show outro for 2 seconds
    }
    return () => { if (meetingTimerRef.current) clearTimeout(meetingTimerRef.current) };
  }, [isMeetingActive, meetingTimer, showMeetingOutro]);
  
  useEffect(() => {
    if (isSabotageActive && sabotageTimer > 0) {
      sabotageTimerRef.current = setTimeout(() => setSabotageTimer(t => t - 1), 1000);
    } else if (sabotageTimer === 0 && isSabotageActive) {
      setIsSabotageActive(false);
      setImpostorWin(true);
      setGameState('finished');
      if(sabotageTimerRef.current) clearTimeout(sabotageTimerRef.current);
    }
    return () => { if (sabotageTimerRef.current) clearTimeout(sabotageTimerRef.current) };
  }, [isSabotageActive, sabotageTimer]);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const isPaused = isMeetingActive || showMeetingIntro || isSabotageActive || isPostDisarmCooldown;

    if (gameState === 'playing' && !isPaused && gameTimer > 0) {
        timerId = setTimeout(() => {
            setGameTimer(t => t - 1);
        }, 1000);
    } else if (gameTimer === 0 && gameState === 'playing' && !isPaused) {
        setImpostorWin(true);
        setGameState('finished');
    }

    return () => {
        if (timerId) clearTimeout(timerId);
    };
  }, [gameTimer, gameState, isMeetingActive, showMeetingIntro, isSabotageActive, isPostDisarmCooldown]);

  useEffect(() => {
    if (isSabotageActive) {
      if (!sabotageBeepIntervalRef.current) {
        playSound('sabotageBeep');
        sabotageBeepIntervalRef.current = setInterval(() => {
          playSound('sabotageBeep');
        }, 2000);
      }
    } else {
      if (sabotageBeepIntervalRef.current) {
        clearInterval(sabotageBeepIntervalRef.current);
        sabotageBeepIntervalRef.current = null;
      }
    }
    return () => {
      if (sabotageBeepIntervalRef.current) {
        clearInterval(sabotageBeepIntervalRef.current);
      }
    };
  }, [isSabotageActive]);

  useEffect(() => {
    if (gameState === 'setup') {
      setRemainingSabotages(sabotageUses);
    }
  }, [sabotageUses, gameState]);

  return (
    <>
      <div className="game-screen" onPointerDown={handleBackgroundPointerDown}>
        <div className={`setup-panel ${gameState !== 'setup' ? 'hidden' : ''}`} onPointerDown={e => e.stopPropagation()}>
          <h1>Among Us Sports</h1>
        
          <form onSubmit={handleAddTask}>
            <div className="form-group">
              <label htmlFor="task-name">Neue Aufgabe</label>
              <div className="task-inputs">
                <input
                  id="task-name"
                  type="text"
                  value={currentTaskName}
                  onChange={e => setCurrentTaskName(e.target.value)}
                  placeholder="z.B. Kabel verbinden"
                  required
                />
                <div className="time-adjuster" role="group" aria-label="Anzahl der Aufgaben">
                  <button type="button" className="adjust-btn" onClick={() => adjustTaskCount(-1)} disabled={currentTaskCount <= 1} aria-label="Anzahl verringern">-</button>
                  <input
                    type="number"
                    className="time-display"
                    value={currentTaskCount}
                    onChange={handleTaskCountChange}
                    onBlur={handleTaskCountBlur}
                    onFocus={handleTaskCountFocus}
                    min="1"
                    max="99"
                    aria-live="polite"
                  />
                  <button type="button" className="adjust-btn" onClick={() => adjustTaskCount(1)} disabled={currentTaskCount >= 99} aria-label="Anzahl erhöhen">+</button>
                </div>
                <button type="submit" className="btn btn-primary">Hinzufügen</button>
              </div>
            </div>
          </form>

          {isSetupPanelExpanded && (
            <>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Spielzeit</label>
                  <div className="time-adjuster">
                    <button type="button" className="adjust-btn" onClick={() => adjustGameTime(setGameTime, -30)} disabled={gameTime <= 60}>-</button>
                    <span className="time-display">{gameTime / 60} min</span>
                    <button type="button" className="adjust-btn" onClick={() => adjustGameTime(setGameTime, 30)} disabled={gameTime >= 30 * 60}>+</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Besprechungszeit</label>
                  <div className="time-adjuster">
                    <button type="button" className="adjust-btn" onClick={() => adjustTime(setMeetingTime, -5)} disabled={meetingTime <= 0}>-</button>
                    <span className="time-display">{meetingTime} s</span>
                    <button type="button" className="adjust-btn" onClick={() => adjustTime(setMeetingTime, 5)} disabled={meetingTime >= 90}>+</button>
                  </div>
                </div>
                <div className="form-group">
                  <label>Sabotagezeit</label>
                  <div className="time-adjuster">
                    <button type="button" className="adjust-btn" onClick={() => adjustTime(setSabotageTime, -5)} disabled={sabotageTime <= 0}>-</button>
                    <span className="time-display">{sabotageTime} s</span>
                    <button type="button" className="adjust-btn" onClick={() => adjustTime(setSabotageTime, 5)} disabled={sabotageTime >= 90}>+</button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                  <label>Sabotage</label>
                  <div className="sabotage-settings">
                      <div className="sabotage-controls-grid">
                        <div className="sabotage-uses-control">
                            <label htmlFor="sabotage-uses">Anzahl Sabotagen</label>
                            <select
                                id="sabotage-uses"
                                className="light-select"
                                value={sabotageUses}
                                onChange={e => setSabotageUses(parseInt(e.target.value, 10))}
                            >
                                <option value="0">0</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                            </select>
                        </div>
                        <div className="sabotage-uses-control">
                            <label htmlFor="codes-per-sabotage">Codes pro Sabotage</label>
                            <select
                                id="codes-per-sabotage"
                                className="light-select"
                                value={codesPerSabotage}
                                onChange={e => setCodesPerSabotage(parseInt(e.target.value, 10))}
                            >
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                            </select>
                        </div>
                      </div>
                      <div className="valid-codes-container">
                        <label>Gültige Codes</label>
                        <div className="valid-codes-list">
                          {sabotageCodes.map(code => (
                            <span key={code} className="valid-code-item">{code}</span>
                          ))}
                          {customCodes.map((code, index) => (
                            <input
                              key={`custom-code-${index}`}
                              type="text"
                              className="valid-code-item"
                              value={code}
                              onChange={(e) => handleCustomCodeChange(index, e.target.value)}
                              maxLength={5}
                              placeholder="Code"
                              aria-label={`Benutzerdefinierter Code ${index + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                  </div>
              </div>
            </>
          )}
          
          <button 
            type="button" 
            className="btn btn-toggle-settings" 
            onClick={() => setIsSetupPanelExpanded(!isSetupPanelExpanded)}
          >
            {isSetupPanelExpanded ? 'Minimieren' : 'Erweitern'}
          </button>
        </div>

        <div className="map-background"></div>
        {gameState !== 'setup' && <TaskProgressBar tasks={tasks} />}
        {gameState === 'playing' && <div className="game-timer-display">{formatTime(gameTimer)}</div>}
        <div className="button-container">
          <div 
              ref={centralButtonRef}
              className="center-button-wrapper" 
              onClick={handleCentralButtonClick} 
              onPointerDown={e => e.stopPropagation()}
              role="button" 
              aria-label={gameState === 'setup' ? 'Spiel starten' : 'Emergency Meeting Button'}
          >
              <div className="button-plate">
                  <div className="emergency-button">
                  {gameState === 'setup' && <span className="emergency-button-text">Spiel<br/>starten</span>}
                  </div>
              </div>
          </div>
        </div>
        {tasks.map(task => (
          <div
            key={task.id}
            className={`task-circle-item ${task.remaining === 0 ? 'completed' : ''} ${draggingTaskId === task.id ? 'dragging' : ''} ${activeTaskId === task.id ? 'active' : ''}`}
            style={{ 
              left: `${task.x}%`, 
              top: `${task.y}%`,
              transform: 'translate(-50%, -50%)',
              touchAction: 'none'
            }}
            onPointerDown={(e) => handlePointerDown(e, task.id)}
            onPointerUp={(e) => handlePointerUp(e, task.id)}
            onPointerLeave={() => setActiveTaskId(null)}
            role="button"
            aria-live="polite"
            aria-label={`${task.name}, noch ${task.remaining} zu erledigen`}
          >
            {gameState === 'setup' && deletableTaskId === task.id && (
              <button 
                className="btn-delete-field" 
                onClick={() => handleDeleteTask(task.id)}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label={`Lösche Aufgabe ${task.name}`}
              >
                &times;
              </button>
            )}
            <div className="task-circle-content">
              <div className="task-name">{task.name}</div>
              <div className="task-count">
                {task.remaining > 0 ? task.remaining : 'ERLEDIGT'}
              </div>
            </div>
          </div>
        ))}
        {gameState !== 'setup' && <button className="new-game-btn" onClick={resetGame}>Neues Spiel</button>}
        {gameState !== 'setup' && sabotageUses > 0 && (
          <div className="sabotage-container">
            <button 
              className="sabotage-btn" 
              onClick={handleSabotageClick} 
              aria-label={`Sabotage-Button, ${remainingSabotages} verbleibend`}
              disabled={isGameInteractionDisabled || remainingSabotages <= 0 || isSabotagePending}
            >
              <span className="sabotage-btn-text">Sabotage</span>
              <span className="sabotage-btn-count">Verbleibend: {remainingSabotages}</span>
            </button>
          </div>
        )}
        
        {showShushAnimation && (
          <div className="shush-overlay">
            <div className="shush-content">
                <div className="shush-text">SHHHHHHH!</div>
            </div>
          </div>
        )}

        {showMeetingIntro && (
          <div className="emergency-intro-overlay">
            <div className="emergency-intro-content">
              <h1 className="emergency-intro-title">Notfall<br/>Meeting</h1>
            </div>
          </div>
        )}

        {isMeetingActive && (
            <div className="meeting-overlay">
                <div className="meeting-content">
                    {showMeetingOutro ? (
                      <h1 className="meeting-outro-title">Meeting<br/>beendet</h1>
                    ) : (
                      <>
                        {meetingTimer < 20 && <h2 className="select-traitor-message">Verräter<br/>wählen</h2>}
                        <div className={`meeting-timer ${meetingTimer <= 10 && meetingTimer > 0 ? 'urgent' : ''} ${meetingTimer >= 20 ? 'large' : ''}`}>
                            {meetingTimer}
                        </div>
                      </>
                    )}
                </div>
            </div>
        )}

        {isSabotageActive && (
            <div className="sabotage-overlay">
                <div className="sabotage-content">
                    <div className={`sabotage-timer ${sabotageTimer <= 10 && sabotageTimer > 0 ? 'urgent' : ''}`}>
                        {sabotageTimer}
                    </div>
                    <div className="sabotage-code-panel">
                      <div className="sabotage-progress-indicator">
                        Code {codesEnteredThisSabotage.length + 1} / {codesPerSabotage}
                      </div>
                      {showValidCodeMessage ? (
                        <div className="valid-code-message">Code gültig</div>
                      ) : (
                        <div className={`code-display ${sabotageCodeError ? 'error' : ''}`}>
                          {currentSabotageCode.padEnd(5, '_')}
                        </div>
                      )}
                      <div className="numpad">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit => (
                          <button key={digit} className="numpad-btn" onClick={() => handleNumpadClick(String(digit))}>
                            {digit}
                          </button>
                        ))}
                        <button className="numpad-btn numpad-btn-delete" onClick={handleClearCode}>X</button>
                        <button className="numpad-btn" onClick={() => handleNumpadClick('0')}>0</button>
                        <button className="numpad-btn numpad-btn-confirm" onClick={handleCodeSubmit}>✓</button>
                      </div>
                    </div>
                </div>
            </div>
        )}

        {impostorWin && (
            <div className="impostor-win-overlay">
                <div className="impostor-win-content">
                    <h1>Verräter gewinnen!</h1>
                    <button onClick={resetGame} className="new-game-btn">Neues Spiel</button>
                </div>
            </div>
        )}

        {crewmateWin && (
            <div className="crewmate-win-overlay">
                <div className="crewmate-win-content">
                    <h1>Teammitglieder gewinnen!</h1>
                    <button onClick={resetGame} className="new-game-btn">Neues Spiel</button>
                </div>
            </div>
        )}
      </div>
      <div className="orientation-lock-overlay">
        <div className="orientation-lock-message">
          <svg className="orientation-lock-icon" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
            <line x1="12" y1="18" x2="12.01" y2="18"></line>
          </svg>
          <p>Bitte drehe dein Gerät ins Querformat.</p>
        </div>
      </div>
    </>
  );
};

const container = document.getElementById('root');
if(container) {
  const root = createRoot(container);
  root.render(<App />);
}
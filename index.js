// --- Constants ---
const STORAGE_KEYS = {
  PLAYER_STATS: 'soloLeveling_playerStats_v2',
  DAILY_QUESTS: 'soloLeveling_dailyQuests_v2', // Stores quests for TODAY_ISO_DATE
  QUEST_HISTORY: 'soloLeveling_questHistory_v2', // Stores quests for past dates {'YYYY-MM-DD': {quests: [], allDone: bool, completedCount: N, totalCount: M}}
  LAST_VISIT_DATE: 'soloLeveling_lastVisitDate_v2'
};
const TODAY_ISO_DATE = new Date().toISOString().slice(0, 10);
const EXP_PER_QUEST_COMPLETION = 10;
const EXP_TO_LEVEL_UP = 100;
const WEEK_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// --- State Variables ---
let playerStats = { level: 1, exp: 0, streak: 0 };
let dailyQuests = { date: TODAY_ISO_DATE, quests: [], allDone: false }; // Quests specifically for today
let questHistory = {}; // Archive of quests for past days
let selectedDateISO = TODAY_ISO_DATE; // Date currently being viewed
let calendarCurrentMonth = new Date(TODAY_ISO_DATE).getMonth();
let calendarCurrentYear = new Date(TODAY_ISO_DATE).getFullYear();

// --- DOM Elements ---
const dom = {
  levelStat: document.getElementById('levelStat'),
  expStat: document.getElementById('expStat'),
  questCountStat: document.getElementById('questCountStat'), // Will show count for selectedDateISO
  streakStat: document.getElementById('streakStat'),
  selectedDateDisplay: document.getElementById('selectedDateDisplay'),
  goalTxt: document.getElementById('goalTxt'),
  progressBar: document.getElementById('progressBar'),
  doneTotalDisplay: document.getElementById('doneTotalDisplay'),
  totalTotalDisplay: document.getElementById('totalTotalDisplay'),
  questListContainer: document.getElementById('questListContainer'),
  addQuestForm: document.getElementById('addQuestForm'),
  newQuestNameInput: document.getElementById('newQuestName'),
  newQuestGoalInput: document.getElementById('newQuestGoal'),
  dailyView: document.getElementById('dailyView'),
  // Calendar elements
  calendarContainer: document.getElementById('calendarContainer'),
  prevMonthBtn: document.getElementById('prevMonthBtn'),
  nextMonthBtn: document.getElementById('nextMonthBtn'),
  monthYearDisplay: document.getElementById('monthYearDisplay'),
  calendarGrid: document.getElementById('calendarGrid')
};

// --- Utility Functions ---
function parseJSONSafe(jsonString, defaultValue = null) {
  if (!jsonString) return defaultValue;
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON:", e, jsonString);
    return defaultValue;
  }
}

function formatDateForDisplay(isoDate) {
  const dateObj = new Date(isoDate + 'T00:00:00'); // Ensure UTC interpretation for consistency
  if (isoDate === TODAY_ISO_DATE) return "Aujourd'hui";
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isoDate === yesterday.toISOString().slice(0,10)) return "Hier";

  return dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// --- Data Persistence ---
function loadData() {
  playerStats = parseJSONSafe(localStorage.getItem(STORAGE_KEYS.PLAYER_STATS), { level: 1, exp: 0, streak: 0 });
  const loadedDailyQuests = parseJSONSafe(localStorage.getItem(STORAGE_KEYS.DAILY_QUESTS));
  questHistory = parseJSONSafe(localStorage.getItem(STORAGE_KEYS.QUEST_HISTORY), {});
  const lastVisitDate = localStorage.getItem(STORAGE_KEYS.LAST_VISIT_DATE);

  if (lastVisitDate && lastVisitDate !== TODAY_ISO_DATE) {
    // This is a new day, archive yesterday's quests if they exist
    if (loadedDailyQuests && loadedDailyQuests.date === lastVisitDate && Array.isArray(loadedDailyQuests.quests)) {
      const completedCount = loadedDailyQuests.quests.filter(q => q.progress >= q.goal).length;
      questHistory[lastVisitDate] = {
        quests: loadedDailyQuests.quests,
        allDone: loadedDailyQuests.allDone || false,
        completedCount: completedCount,
        totalCount: loadedDailyQuests.quests.length
      };
      
      if (loadedDailyQuests.allDone && loadedDailyQuests.quests.length > 0) {
        playerStats.streak = (playerStats.streak || 0) + 1;
      } else {
        playerStats.streak = 0; // Streak broken if not all quests done or no quests
      }
    } else if (lastVisitDate < TODAY_ISO_DATE) { // Handle case where user skips days without quests on lastVisitDate
         playerStats.streak = 0;
    }
    // Reset dailyQuests for the new day
    dailyQuests = { date: TODAY_ISO_DATE, quests: [], allDone: false };
  } else if (loadedDailyQuests && loadedDailyQuests.date === TODAY_ISO_DATE) {
    // Still today, load today's quests
    dailyQuests = loadedDailyQuests;
  } else {
    // No relevant daily quests found, or first visit
    dailyQuests = { date: TODAY_ISO_DATE, quests: [], allDone: false };
  }
  
  // Ensure quests property is always an array
  if (!Array.isArray(dailyQuests.quests)) {
      dailyQuests.quests = [];
  }
  dailyQuests.date = TODAY_ISO_DATE; // Ensure date is set correctly

  localStorage.setItem(STORAGE_KEYS.LAST_VISIT_DATE, TODAY_ISO_DATE);
  saveData(); // Save initial state or after daily processing
}

function saveData() {
  localStorage.setItem(STORAGE_KEYS.PLAYER_STATS, JSON.stringify(playerStats));
  // Only save 'dailyQuests' if they are for the current actual day
  if (selectedDateISO === TODAY_ISO_DATE) {
    localStorage.setItem(STORAGE_KEYS.DAILY_QUESTS, JSON.stringify(dailyQuests));
  }
  localStorage.setItem(STORAGE_KEYS.QUEST_HISTORY, JSON.stringify(questHistory));
}

// --- Calendar Functions ---
function renderCalendar() {
  dom.monthYearDisplay.textContent = new Date(calendarCurrentYear, calendarCurrentMonth).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric'
  });
  dom.calendarGrid.innerHTML = '';

  // Add day headers
  WEEK_DAYS.forEach(day => {
    const dayHeaderEl = document.createElement('div');
    dayHeaderEl.className = 'calendar-day-header';
    dayHeaderEl.textContent = day;
    dom.calendarGrid.appendChild(dayHeaderEl);
  });

  const firstDayOfMonth = new Date(calendarCurrentYear, calendarCurrentMonth, 1).getDay();
  const daysInMonth = new Date(calendarCurrentYear, calendarCurrentMonth + 1, 0).getDate();

  // Add empty cells for days before the first of the month
  for (let i = 0; i < firstDayOfMonth; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    dom.calendarGrid.appendChild(emptyCell);
  }

  // Add day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = day;
    const cellDateISO = new Date(calendarCurrentYear, calendarCurrentMonth, day).toISOString().slice(0, 10);
    dayCell.dataset.date = cellDateISO;

    if (cellDateISO === TODAY_ISO_DATE) dayCell.classList.add('today');
    if (cellDateISO === selectedDateISO) dayCell.classList.add('selected');
    
    // Add status dot
    const dayData = questHistory[cellDateISO] || (cellDateISO === TODAY_ISO_DATE ? dailyQuests : null);
    if (dayData && Array.isArray(dayData.quests) && dayData.quests.length > 0) {
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot';
        if (dayData.allDone) {
            statusDot.classList.add('completed');
             statusDot.setAttribute('aria-label', 'Toutes les quêtes terminées');
        } else if (dayData.quests.some(q => q.progress > 0 || q.progress < q.goal)) {
             statusDot.classList.add('partial');
             statusDot.setAttribute('aria-label', 'Quêtes en cours ou incomplètes');
        }
        dayCell.appendChild(statusDot);
    }
    
    // Disable future dates
    if (cellDateISO > TODAY_ISO_DATE) {
        dayCell.classList.add('empty'); // Style as empty/disabled
        dayCell.style.cursor = 'not-allowed';
        dayCell.style.opacity = '0.5';
    } else {
        dayCell.addEventListener('click', handleDayClick);
    }

    dom.calendarGrid.appendChild(dayCell);
  }
}

function handleDayClick(event) {
  const newSelectedDate = event.target.closest('.calendar-day').dataset.date;
  if (newSelectedDate && newSelectedDate <= TODAY_ISO_DATE) {
    selectedDateISO = newSelectedDate;
    const dateObj = new Date(selectedDateISO);
    calendarCurrentMonth = dateObj.getMonth();
    calendarCurrentYear = dateObj.getFullYear();
    renderCalendar(); // Re-render calendar to update selection
    renderDailyViewForSelectedDate();
  }
}

function changeMonth(offset) {
  calendarCurrentMonth += offset;
  if (calendarCurrentMonth < 0) {
    calendarCurrentMonth = 11;
    calendarCurrentYear--;
  } else if (calendarCurrentMonth > 11) {
    calendarCurrentMonth = 0;
    calendarCurrentYear++;
  }
  renderCalendar();
}

// --- Rendering Functions ---
function renderPlayerStats() {
  dom.levelStat.textContent = playerStats.level;
  dom.expStat.textContent = playerStats.exp;
  dom.streakStat.textContent = playerStats.streak;
  // questCountStat is updated in renderDailyViewForSelectedDate
}

function renderDailyViewForSelectedDate() {
  dom.selectedDateDisplay.textContent = formatDateForDisplay(selectedDateISO);
  
  let questsToRender = [];
  let currentQuestsAllDone = false;
  let currentCompletedCount = 0;
  let currentTotalCount = 0;

  if (selectedDateISO === TODAY_ISO_DATE) {
    questsToRender = Array.isArray(dailyQuests.quests) ? dailyQuests.quests : [];
    dom.addQuestForm.style.display = 'grid';
    currentQuestsAllDone = dailyQuests.allDone;
  } else if (questHistory[selectedDateISO]) {
    const historyEntry = questHistory[selectedDateISO];
    questsToRender = Array.isArray(historyEntry.quests) ? historyEntry.quests : [];
    dom.addQuestForm.style.display = 'none';
    currentQuestsAllDone = historyEntry.allDone;
  } else {
    // No data for this past date, or future date (though future clicks are disabled)
    questsToRender = [];
    dom.addQuestForm.style.display = 'none';
  }

  dom.questListContainer.innerHTML = '';
  questsToRender.forEach((quest, index) => {
    const questEl = document.createElement('div');
    questEl.className = 'quest';
    const isCompleted = quest.progress >= quest.goal;
    const safeQuestName = quest.name ? quest.name.replace(/"/g, "&quot;") : "Quête sans nom";

    questEl.innerHTML = `
      <span class="${isCompleted ? 'done' : ''}">${safeQuestName}</span>
      <span class="count ${isCompleted ? 'done' : ''}">${quest.progress || 0}/${quest.goal || 0}</span>
      <button 
        data-index="${index}" 
        ${isCompleted || selectedDateISO !== TODAY_ISO_DATE ? 'disabled' : ''} 
        aria-label="Augmenter la progression pour ${safeQuestName}">+1</button>
    `;
    dom.questListContainer.appendChild(questEl);
  });

  currentCompletedCount = questsToRender.filter(q => q.progress >= q.goal).length;
  currentTotalCount = questsToRender.length;

  dom.questCountStat.textContent = currentTotalCount; // Update stat for selected day's quest count
  dom.doneTotalDisplay.textContent = currentCompletedCount;
  dom.totalTotalDisplay.textContent = currentTotalCount;
  
  const progressPercent = currentTotalCount > 0 ? (currentCompletedCount / currentTotalCount) * 100 : 0;
  dom.progressBar.style.width = `${progressPercent}%`;

  if (currentTotalCount > 0 && currentCompletedCount === currentTotalCount) {
    dom.goalTxt.textContent = "Toutes les quêtes terminées !";
  } else if (currentTotalCount > 0) {
    dom.goalTxt.textContent = "Terminer toutes les quêtes";
  } else if (selectedDateISO === TODAY_ISO_DATE) {
    dom.goalTxt.textContent = "Ajouter des quêtes";
  } else {
     dom.goalTxt.textContent = "Aucune quête enregistrée pour ce jour.";
  }

  renderPlayerStats(); // General player stats are always current
}

// --- Event Handlers ---
function handleAddQuest(event) {
  event.preventDefault();
  if (selectedDateISO !== TODAY_ISO_DATE) return; // Should not happen if form is hidden

  const name = dom.newQuestNameInput.value.trim();
  const goal = parseInt(dom.newQuestGoalInput.value, 10);

  if (name && goal > 0) {
    if (!Array.isArray(dailyQuests.quests)) dailyQuests.quests = []; // Ensure array
    dailyQuests.quests.push({ name, goal, progress: 0 });
    dailyQuests.allDone = false; // Adding a new quest means not all are done yet
    dom.newQuestNameInput.value = '';
    dom.newQuestGoalInput.value = '';
    renderDailyViewForSelectedDate();
    renderCalendar(); // Update calendar for potential status dot change
    saveData();
  } else {
    alert("Veuillez entrer un nom de quête valide et un objectif numérique positif.");
  }
}

function handleQuestProgress(event) {
  if (!event.target.matches('button[data-index]') || selectedDateISO !== TODAY_ISO_DATE) return;

  const index = parseInt(event.target.dataset.index, 10);
  const quest = dailyQuests.quests[index];

  if (quest && quest.progress < quest.goal) {
    quest.progress++;
    if (quest.progress === quest.goal) {
      playerStats.exp += EXP_PER_QUEST_COMPLETION;
      if (playerStats.exp >= EXP_TO_LEVEL_UP) {
        playerStats.level++;
        playerStats.exp -= EXP_TO_LEVEL_UP;
        // Could add a notification for level up here
        // e.g., showSystemMessage(`Niveau Supérieur ! Vous êtes maintenant niveau ${playerStats.level}.`, 'success');
      }
    }
  }
  
  dailyQuests.allDone = dailyQuests.quests.length > 0 && dailyQuests.quests.every(q => q.progress >= q.goal);

  renderDailyViewForSelectedDate();
  renderCalendar(); // Update calendar for potential status dot change
  saveData();
}

// --- Initialization ---
function initApp() {
  loadData(); // Load all data including history and today's quests
  
  // Set initial calendar view to the month/year of the selectedDateISO (which defaults to today)
  const initialDate = new Date(selectedDateISO + 'T00:00:00');
  calendarCurrentMonth = initialDate.getMonth();
  calendarCurrentYear = initialDate.getFullYear();

  dom.addQuestForm.addEventListener('submit', handleAddQuest);
  dom.questListContainer.addEventListener('click', handleQuestProgress);
  dom.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  dom.nextMonthBtn.addEventListener('click', () => changeMonth(1));
  
  renderCalendar(); // Render calendar first
  renderDailyViewForSelectedDate(); // Then render quests for the initially selected day (today)
  renderPlayerStats(); // Render overall player stats
}

// Start the application
initApp();


// --- Constants ---
const STORAGE_KEYS = {
  PLAYER_STATS: 'soloLeveling_playerStats_v2',
  DAILY_QUESTS: 'soloLeveling_dailyQuests_v2',
  QUEST_HISTORY: 'soloLeveling_questHistory_v2',
  LAST_VISIT_DATE: 'soloLeveling_lastVisitDate_v2'
};

// Function to get today's date as YYYY-MM-DD in local time
function getLocalTodayISOString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TODAY_ISO_DATE = getLocalTodayISOString();
const EXP_PER_QUEST_COMPLETION = 10;
const EXP_TO_LEVEL_UP = 100;
const WEEK_DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// --- State Variables ---
let playerStats = { level: 1, exp: 0, streak: 0 };
let dailyQuests = { date: TODAY_ISO_DATE, quests: [], allDone: false };
let questHistory = {};
let selectedDateISO = TODAY_ISO_DATE;
let calendarCurrentMonth = new Date(TODAY_ISO_DATE.split('-')[0], TODAY_ISO_DATE.split('-')[1] - 1, TODAY_ISO_DATE.split('-')[2]).getMonth();
let calendarCurrentYear = new Date(TODAY_ISO_DATE.split('-')[0], TODAY_ISO_DATE.split('-')[1] - 1, TODAY_ISO_DATE.split('-')[2]).getFullYear();
let editingQuestIndex = null; // To track which quest is being edited

// --- DOM Elements ---
const dom = {
  levelStat: document.getElementById('levelStat'),
  expStat: document.getElementById('expStat'),
  questCountStat: document.getElementById('questCountStat'),
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

function formatDateForDisplay(isoDate) { // isoDate is expected to be local YYYY-MM-DD
  if (isoDate === TODAY_ISO_DATE) return "Aujourd'hui";
  
  const localYesterday = new Date();
  localYesterday.setDate(localYesterday.getDate() - 1);
  const yesterdayDateString = `${localYesterday.getFullYear()}-${(localYesterday.getMonth() + 1).toString().padStart(2, '0')}-${localYesterday.getDate().toString().padStart(2, '0')}`;
  
  if (isoDate === yesterdayDateString) return "Hier";

  // Parse YYYY-MM-DD as local date
  const parts = isoDate.split('-');
  const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));

  return dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

// --- Data Persistence ---
function loadData() {
  playerStats = parseJSONSafe(localStorage.getItem(STORAGE_KEYS.PLAYER_STATS), { level: 1, exp: 0, streak: 0 });
  const loadedDailyQuests = parseJSONSafe(localStorage.getItem(STORAGE_KEYS.DAILY_QUESTS));
  questHistory = parseJSONSafe(localStorage.getItem(STORAGE_KEYS.QUEST_HISTORY), {});
  const lastVisitDate = localStorage.getItem(STORAGE_KEYS.LAST_VISIT_DATE); // This might be UTC-based from old versions

  if (lastVisitDate && lastVisitDate !== TODAY_ISO_DATE) { // Compare with new local TODAY_ISO_DATE
    // This block handles the transition to a new day based on local time
    if (loadedDailyQuests && loadedDailyQuests.date === lastVisitDate && Array.isArray(loadedDailyQuests.quests)) {
      // Archive quests from the 'lastVisitDate' (which could be the previous local day or a UTC day)
      const completedCount = loadedDailyQuests.quests.filter(q => q.progress >= q.goal).length;
      questHistory[lastVisitDate] = { // Key is the date string from storage
        quests: loadedDailyQuests.quests,
        allDone: loadedDailyQuests.allDone || false,
        completedCount: completedCount,
        totalCount: loadedDailyQuests.quests.length
      };
      
      if (loadedDailyQuests.allDone && loadedDailyQuests.quests.length > 0) {
        playerStats.streak = (playerStats.streak || 0) + 1;
      } else {
        playerStats.streak = 0;
      }
    } else if (lastVisitDate < TODAY_ISO_DATE) { // If last visit was definitely a past day
         playerStats.streak = 0;
    }
    // Reset daily quests for the new local today
    dailyQuests = { date: TODAY_ISO_DATE, quests: [], allDone: false };
  } else if (loadedDailyQuests && loadedDailyQuests.date === TODAY_ISO_DATE) {
    // Loaded quests are for today's local date
    dailyQuests = loadedDailyQuests;
  } else if (loadedDailyQuests && loadedDailyQuests.date === lastVisitDate && lastVisitDate === TODAY_ISO_DATE) {
    // This handles the case where lastVisitDate (potentially UTC) matches today's local date string
    dailyQuests = loadedDailyQuests;
  }
  else {
    // Default to new quests for today
    dailyQuests = { date: TODAY_ISO_DATE, quests: [], allDone: false };
  }
  
  if (!Array.isArray(dailyQuests.quests)) {
      dailyQuests.quests = [];
  }
  // Ensure dailyQuests object is always for the current local date
  dailyQuests.date = TODAY_ISO_DATE; 

  localStorage.setItem(STORAGE_KEYS.LAST_VISIT_DATE, TODAY_ISO_DATE); // Save local today as last visit
  saveData();
}

function saveData() {
  localStorage.setItem(STORAGE_KEYS.PLAYER_STATS, JSON.stringify(playerStats));
  // Always save the current state of dailyQuests, which is for TODAY_ISO_DATE (local)
  localStorage.setItem(STORAGE_KEYS.DAILY_QUESTS, JSON.stringify(dailyQuests));
  localStorage.setItem(STORAGE_KEYS.QUEST_HISTORY, JSON.stringify(questHistory));
}

// --- Calendar Functions ---
function renderCalendar() {
  dom.monthYearDisplay.textContent = new Date(calendarCurrentYear, calendarCurrentMonth).toLocaleDateString('fr-FR', {
    month: 'long', year: 'numeric'
  });
  dom.calendarGrid.innerHTML = '';

  WEEK_DAYS.forEach(day => {
    const dayHeaderEl = document.createElement('div');
    dayHeaderEl.className = 'calendar-day-header';
    dayHeaderEl.textContent = day;
    dom.calendarGrid.appendChild(dayHeaderEl);
  });

  const firstDayOfMonth = new Date(calendarCurrentYear, calendarCurrentMonth, 1).getDay();
  const daysInMonth = new Date(calendarCurrentYear, calendarCurrentMonth + 1, 0).getDate();

  for (let i = 0; i < firstDayOfMonth; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    dom.calendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    const dayNumberSpan = document.createElement('span');
    dayNumberSpan.textContent = day;
    dayCell.appendChild(dayNumberSpan);

    // Construct YYYY-MM-DD string for the cell in local time
    const cellDate = new Date(calendarCurrentYear, calendarCurrentMonth, day);
    const cellYear = cellDate.getFullYear();
    const cellMonth = (cellDate.getMonth() + 1).toString().padStart(2, '0');
    const cellDay = cellDate.getDate().toString().padStart(2, '0');
    const cellDateISO = `${cellYear}-${cellMonth}-${cellDay}`;
    
    dayCell.dataset.date = cellDateISO;

    if (cellDateISO === TODAY_ISO_DATE) dayCell.classList.add('today');
    if (cellDateISO === selectedDateISO) dayCell.classList.add('selected');
    
    const dayData = questHistory[cellDateISO] || (cellDateISO === TODAY_ISO_DATE ? dailyQuests : null);
    if (dayData && Array.isArray(dayData.quests) && dayData.quests.length > 0) {
        const statusIcon = document.createElement('span');
        statusIcon.className = 'status-icon';
        if (dayData.allDone) {
            statusIcon.classList.add('completed');
            statusIcon.setAttribute('aria-label', 'Toutes les quêtes terminées');
        } else if (dayData.quests.some(q => q.progress > 0 || (q.progress < q.goal && q.progress !== undefined))) {
            const anyProgress = dayData.quests.some(q => q.progress > 0);
            const anyIncomplete = dayData.quests.some(q => (q.progress || 0) < q.goal);
            if(anyProgress || anyIncomplete){ 
                 statusIcon.classList.add('partial');
                 statusIcon.setAttribute('aria-label', 'Quêtes en cours ou incomplètes');
            }
        }
        if(statusIcon.classList.contains('completed') || statusIcon.classList.contains('partial')) {
            dayCell.appendChild(statusIcon);
        }
    }
    
    if (cellDateISO > TODAY_ISO_DATE) {
        dayCell.classList.add('empty');
        dayCell.style.cursor = 'not-allowed';
        dayCell.style.opacity = '0.5';
    } else {
        dayCell.addEventListener('click', handleDayClick);
    }
    dom.calendarGrid.appendChild(dayCell);
  }
}

function handleDayClick(event) {
  const dayCell = event.target.closest('.calendar-day');
  if (dayCell && !dayCell.classList.contains('empty')) {
      const newSelectedDate = dayCell.dataset.date; // This is now a local YYYY-MM-DD
      if (newSelectedDate && newSelectedDate <= TODAY_ISO_DATE) {
          selectedDateISO = newSelectedDate;
          // Parse YYYY-MM-DD as local date for calendar month/year
          const parts = selectedDateISO.split('-');
          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          calendarCurrentMonth = dateObj.getMonth();
          calendarCurrentYear = dateObj.getFullYear();
          editingQuestIndex = null; 
          renderCalendar();
          renderDailyViewForSelectedDate();
      }
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
  editingQuestIndex = null; 
  renderCalendar();
}

// --- Rendering Functions ---
function renderPlayerStats() {
  dom.levelStat.textContent = playerStats.level;
  dom.expStat.textContent = playerStats.exp;
  dom.streakStat.textContent = playerStats.streak;
}

function renderDailyViewForSelectedDate() {
  dom.selectedDateDisplay.textContent = formatDateForDisplay(selectedDateISO);
  
  let questsToRender = [];
  let currentQuestsAllDone = false;
  const isToday = selectedDateISO === TODAY_ISO_DATE;

  if (isToday) {
    questsToRender = Array.isArray(dailyQuests.quests) ? dailyQuests.quests : [];
    dom.addQuestForm.style.display = 'grid';
    currentQuestsAllDone = dailyQuests.allDone;
  } else if (questHistory[selectedDateISO]) {
    const historyEntry = questHistory[selectedDateISO];
    questsToRender = Array.isArray(historyEntry.quests) ? historyEntry.quests : [];
    dom.addQuestForm.style.display = 'none';
    currentQuestsAllDone = historyEntry.allDone;
  } else {
    questsToRender = [];
    dom.addQuestForm.style.display = 'none';
  }

  dom.questListContainer.innerHTML = '';
  questsToRender.forEach((quest, index) => {
    const questEl = document.createElement('div');
    questEl.className = 'quest';
    questEl.dataset.index = index; 

    const safeQuestName = quest.name ? quest.name.replace(/"/g, "&quot;") : "Quête sans nom";
    const isCompleted = quest.progress >= quest.goal;

    if (editingQuestIndex === index && isToday) {
      questEl.innerHTML = `
        <div class="quest-edit-form">
          <input type="text" class="edit-quest-name" value="${safeQuestName}" aria-label="Nom de la quête">
          <input type="number" class="edit-quest-goal" value="${quest.goal || 0}" min="1" aria-label="Objectif de la quête">
          <button class="btn-small btn-save-quest" data-index="${index}" aria-label="Sauvegarder les modifications">OK</button>
          <button class="btn-small btn-cancel-edit" data-index="${index}" aria-label="Annuler les modifications">Ann.</button>
          <span></span> 
        </div>
      `;
    } else {
      questEl.innerHTML = `
        <div class="quest-details">
            <span class="name ${isCompleted ? 'done' : ''}">${safeQuestName}</span>
            <span class="count ${isCompleted ? 'done' : ''}">${quest.progress || 0}/${quest.goal || 0}</span>
            <button 
              class="btn-progress"
              data-index="${index}" 
              ${isCompleted || !isToday ? 'disabled' : ''} 
              aria-label="Augmenter la progression pour ${safeQuestName}">+1</button>
            ${isToday ? `
              <button class="btn-edit-quest" data-index="${index}" aria-label="Modifier ${safeQuestName}" ${isCompleted ? 'disabled' : ''}>Mod</button>
              <button class="btn-delete-quest" data-index="${index}" aria-label="Supprimer ${safeQuestName}">Sup</button>
            ` : `
              <span role="button" class="btn-edit-quest" aria-disabled="true" style="opacity:0.5; cursor:not-allowed; text-align:center;">Mod</span>
              <span role="button" class="btn-delete-quest" aria-disabled="true" style="opacity:0.5; cursor:not-allowed; text-align:center;">Sup</span>
            `}
        </div>
      `;
    }
    dom.questListContainer.appendChild(questEl);
  });

  const currentCompletedCount = questsToRender.filter(q => q.progress >= q.goal).length;
  const currentTotalCount = questsToRender.length;

  dom.questCountStat.textContent = currentTotalCount;
  dom.doneTotalDisplay.textContent = currentCompletedCount;
  dom.totalTotalDisplay.textContent = currentTotalCount;
  
  const progressPercent = currentTotalCount > 0 ? (currentCompletedCount / currentTotalCount) * 100 : 0;
  dom.progressBar.style.width = `${progressPercent}%`;

  if (currentTotalCount > 0 && currentCompletedCount === currentTotalCount) {
    dom.goalTxt.textContent = "Toutes les quêtes terminées !";
  } else if (currentTotalCount > 0) {
    dom.goalTxt.textContent = "Terminer toutes les quêtes";
  } else if (isToday) {
    dom.goalTxt.textContent = "Ajouter des quêtes";
  } else {
     dom.goalTxt.textContent = "Aucune quête enregistrée pour ce jour.";
  }

  renderPlayerStats();
}

// --- Event Handlers ---
function handleAddQuest(event) {
  event.preventDefault();
  if (selectedDateISO !== TODAY_ISO_DATE) return;

  const name = dom.newQuestNameInput.value.trim();
  const goal = parseInt(dom.newQuestGoalInput.value, 10);

  if (name && goal > 0) {
    if (!Array.isArray(dailyQuests.quests)) dailyQuests.quests = [];
    dailyQuests.quests.push({ name, goal, progress: 0 });
    dailyQuests.allDone = false;
    dom.newQuestNameInput.value = '';
    dom.newQuestGoalInput.value = '';
    editingQuestIndex = null; 
    renderDailyViewForSelectedDate();
    renderCalendar();
    saveData();
  } else {
    alert("Veuillez entrer un nom de quête valide et un objectif numérique positif.");
  }
}

function handleQuestListActions(event) {
  const target = event.target;
  const questIndex = parseInt(target.dataset.index, 10);

  if (isNaN(questIndex) || selectedDateISO !== TODAY_ISO_DATE) return;

  if (target.classList.contains('btn-progress')) {
    const quest = dailyQuests.quests[questIndex];
    if (quest && quest.progress < quest.goal) {
      quest.progress++;
      if (quest.progress === quest.goal) {
        playerStats.exp += EXP_PER_QUEST_COMPLETION;
        if (playerStats.exp >= EXP_TO_LEVEL_UP) {
          playerStats.level++;
          playerStats.exp -= EXP_TO_LEVEL_UP;
        }
      }
    }
    dailyQuests.allDone = dailyQuests.quests.length > 0 && dailyQuests.quests.every(q => q.progress >= q.goal);
    editingQuestIndex = null;
  } else if (target.classList.contains('btn-edit-quest')) {
    editingQuestIndex = questIndex;
  } else if (target.classList.contains('btn-delete-quest')) {
    if (confirm(`Supprimer la quête "${dailyQuests.quests[questIndex].name}" ?`)) {
      dailyQuests.quests.splice(questIndex, 1);
      dailyQuests.allDone = dailyQuests.quests.length > 0 && dailyQuests.quests.every(q => q.progress >= q.goal);
      editingQuestIndex = null; 
    }
  } else if (target.classList.contains('btn-save-quest')) {
    const questElement = target.closest('.quest');
    const nameInput = questElement.querySelector('.edit-quest-name');
    const goalInput = questElement.querySelector('.edit-quest-goal');
    const newName = nameInput.value.trim();
    const newGoal = parseInt(goalInput.value, 10);

    if (newName && newGoal > 0) {
      const quest = dailyQuests.quests[questIndex];
      quest.name = newName;
      quest.goal = newGoal;
      if (quest.progress > newGoal) quest.progress = newGoal;
      dailyQuests.allDone = dailyQuests.quests.length > 0 && dailyQuests.quests.every(q => q.progress >= q.goal);
      editingQuestIndex = null;
    } else {
      alert("Le nom de la quête ne peut pas être vide et l'objectif doit être un nombre positif.");
      return; 
    }
  } else if (target.classList.contains('btn-cancel-edit')) {
    editingQuestIndex = null;
  } else {
    return; 
  }

  renderDailyViewForSelectedDate();
  renderCalendar();
  saveData();
}


// --- Initialization ---
function initApp() {
  loadData(); // TODAY_ISO_DATE is now local, loadData will adapt
  
  // Initialize calendar month/year based on selectedDateISO (which is TODAY_ISO_DATE initially, local)
  const initialDateParts = selectedDateISO.split('-');
  calendarCurrentMonth = parseInt(initialDateParts[1]) - 1; // Month is 0-indexed
  calendarCurrentYear = parseInt(initialDateParts[0]);

  dom.addQuestForm.addEventListener('submit', handleAddQuest);
  dom.questListContainer.addEventListener('click', handleQuestListActions);
  dom.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  dom.nextMonthBtn.addEventListener('click', () => changeMonth(1));
  
  renderCalendar();
  renderDailyViewForSelectedDate();
}

// Start the application
initApp();

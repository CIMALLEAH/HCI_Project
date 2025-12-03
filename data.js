
// Central Data Storage for PlanEase App
// This file contains all app data to ensure consistency across pages

const AppData = {
  // Function to load data from database.json
  async loadData() {
    try {
      const response = await fetch('database.json');
      const data = await response.json();
      // Assign loaded data to AppData properties
      this.user = data.user;
      this.events = data.events;
      this.tasks = data.tasks;
      this.conflicts = data.conflicts;
      this.settings = data.settings;
      this.calendarEvents = data.calendarEvents;
    } catch (error) {
      console.error('Error loading data:', error);
    }
  },

  // Function to save data to database.json
  async saveData() {
    try {
      const dataToSave = {
        user: this.user,
        events: this.events,
        tasks: this.tasks,
        conflicts: this.conflicts,
        settings: this.settings,
        calendarEvents: this.calendarEvents,
      };
      // This part requires a server-side component to write to the file.
      // For a client-side only app, this would typically be handled by downloading the file.
      console.log('Simulating saving data:', JSON.stringify(dataToSave, null, 2));
       alert('CRUD operation successful! Data has been logged to the console.');

    } catch (error) {
      console.error('Error saving data:', error);
    }
  },

  // Helper Functions
  getEventById(id) {
    return this.events.find(event => event.id === id);
  },

  getTaskById(id) {
    return this.tasks.find(task => task.id === id);
  },

  getEventsByDate(dateString) {
    return this.events.filter(event => event.date === dateString);
  },

  getTasksByDate(dateString) {
    return this.tasks.filter(task => task.dueDate === dateString);
  },

  getTodayEvents() {
    const today = new Date().toISOString().split('T')[0];
    return this.getEventsByDate(today);
  },

  getUpcomingEvents(days = 7) {
    const today = new Date();
    const upcoming = [];

    this.events.forEach(event => {
      const eventDate = new Date(event.date);
      const diffTime = eventDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays <= days) {
        upcoming.push({...event, daysUntil: diffDays});
      }
    });

    return upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  getUpcomingTasks(days = 7) {
    const today = new Date();
    const upcoming = [];

    this.tasks.forEach(task => {
      if (!task.completed) {
        const taskDate = new Date(task.dueDate);
        const diffTime = taskDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= days) {
          upcoming.push({...task, daysUntil: diffDays});
        }
      }
    });

    return upcoming.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  },

  getCurrentEvent() {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    const today = now.toISOString().split('T')[0];

    return this.events.find(event => {
      if (event.date !== today) return false;

      const startTime = this.convertTo24Hour(event.startTime);
      const endTime = this.convertTo24Hour(event.endTime);

      return currentTime >= startTime && currentTime <= endTime;
    });
  },

  convertTo24Hour(time12h) {
    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');

    if (hours === '12') {
      hours = '00';
    }

    if (modifier === 'PM') {
      hours = parseInt(hours, 10) + 12;
    }

    return `${hours}:${minutes}`;
  },

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  },

  formatDate(dateString) {
    const date = new Date(dateString);
    const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  },

  getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  },

  getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  },

  hasEventsOnDay(year, month, day) {
    if (this.calendarEvents[year] && this.calendarEvents[year][month + 1]) {
      return this.calendarEvents[year][month + 1].includes(day);
    }
    return false;
  },

  isConflictDay(year, month, day) {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return this.conflicts.some(conflict => conflict.date === dateString);
  },

  // Add new event
  addEvent(event) {
    const newEvent = {
      id: this.events.length + 1,
      ...event
    };
    this.events.push(newEvent);
    this.saveData(); // Save after adding
    return newEvent;
  },

  // Add new task
  addTask(task) {
    const newTask = {
      id: this.tasks.length + 1,
      completed: false,
      ...task
    };
    this.tasks.push(newTask);
    this.saveData(); // Save after adding
    return newTask;
  },

  // Update event
  updateEvent(id, updates) {
    const index = this.events.findIndex(event => event.id === id);
    if (index !== -1) {
      this.events[index] = {...this.events[index], ...updates};
      this.saveData(); // Save after updating
      return this.events[index];
    }
    return null;
  },

  // Update task
  updateTask(id, updates) {
    const index = this.tasks.findIndex(task => task.id === id);
    if (index !== -1) {
      this.tasks[index] = {...this.tasks[index], ...updates};
      this.saveData(); // Save after updating
      return this.tasks[index];
    }
    return null;
  },

  // Delete event
  deleteEvent(id) {
    const index = this.events.findIndex(event => event.id === id);
    if (index !== -1) {
      this.events.splice(index, 1);
      this.saveData(); // Save after deleting
      return true;
    }
    return false;
  },

  // Delete task
  deleteTask(id) {
    const index = this.tasks.findIndex(task => task.id === id);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      this.saveData(); // Save after deleting
      return true;
    }
    return false;
  }
};

// Make AppData globally available and load data
if (typeof window !== 'undefined') {
  window.AppData = AppData;
  window.AppData.loadData();
}

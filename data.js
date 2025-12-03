// Central Data Storage for PlanEase App
// This file contains all app data to ensure consistency across pages

const AppData = {
  // User Information
  user: {
    firstName: "Damian",
    lastName: "Alvah",
    email: "dalvah@gmail.com",
    accountCreated: "October 1, 2025",
    avatar: null // Can be replaced with actual image URL
  },

  // Events and Classes
  events: [
    {
      id: 1,
      type: "school",
      category: "Class",
      title: "IT 321",
      fullTitle: "Human-Computer Interaction",
      location: "Online",
      date: "2025-10-22",
      startTime: "10:00 AM",
      endTime: "11:30 AM",
      recurring: true,
      recurringDays: ["Monday", "Wednesday", "Friday"]
    },
    {
      id: 2,
      type: "school",
      category: "Class",
      title: "CS 311",
      fullTitle: "Automata Theory and Formal Languages",
      location: "Online",
      date: "2025-10-23",
      startTime: "7:00 AM",
      endTime: "8:30 AM",
      recurring: true,
      recurringDays: ["Tuesday", "Thursday"]
    },
    {
      id: 3,
      type: "school",
      category: "Class",
      title: "GEd 104",
      fullTitle: "The Contemporary World",
      location: "Online",
      date: "2025-10-23",
      startTime: "8:30 AM",
      endTime: "10:00 AM",
      recurring: true,
      recurringDays: ["Tuesday", "Thursday"]
    },
    {
      id: 4,
      type: "school",
      category: "Class",
      title: "IT 314",
      fullTitle: "Web Systems and Technologies",
      location: "Online",
      date: "2025-10-23",
      startTime: "2:00 PM",
      endTime: "4:00 PM",
      recurring: true,
      recurringDays: ["Tuesday", "Thursday"]
    },
    {
      id: 5,
      type: "school",
      category: "Class",
      title: "IT 331",
      fullTitle: "Application Development and Emerging Technologies",
      location: "Online",
      date: "2025-10-24",
      startTime: "7:00 AM",
      endTime: "10:00 AM",
      recurring: true,
      recurringDays: ["Friday"]
    },
    {
      id: 6,
      type: "school",
      category: "Class",
      title: "CS 312",
      fullTitle: "Mobile Computing",
      location: "Online",
      date: "2025-10-24",
      startTime: "7:00 AM",
      endTime: "8:30 AM",
      recurring: true,
      recurringDays: ["Friday"]
    },
    {
      id: 7,
      type: "personal",
      category: "Appointment",
      title: "Appointment",
      fullTitle: "Dental Appointment",
      location: "Dental Clinic",
      date: "2025-10-26",
      startTime: "9:00 AM",
      endTime: "10:00 AM",
      recurring: false
    }
  ],

  // Tasks
  tasks: [
    {
      id: 1,
      type: "personal",
      title: "Video",
      description: "Editing of video",
      fullDescription: "Cutting and pasting of clips as well as finding music that fits well with...",
      location: "Online",
      dueDate: "2025-10-23",
      dueTime: "10:00 PM",
      completed: false
    },
    {
      id: 2,
      type: "work",
      title: "Design",
      description: "Webpage Layout (Page 2 out of 4)",
      fullDescription: "Webpage Layout (Page 2 out of 4)",
      location: "Online",
      dueDate: "2025-10-24",
      dueTime: null,
      completed: false
    }
  ],

  // Conflicts
  conflicts: [
    {
      id: 1,
      title: "Schedule Conflict Detected",
      description: "Personal appointment overlaps with IT 331 on Oct 26",
      date: "2025-10-26",
      event1: 7, // Dental Appointment
      event2: 5  // IT 331
    }
  ],

  // Settings
  settings: {
    notifications: {
      enabled: true,
      defaultReminderTime: "1 hour before",
      reminderType: "Sound & Vibrate"
    },
    preferences: {
      defaultView: "Home",
      timeFormat: "12-hour (10:00PM)",
      dateFormat: "Month DD, YYYY (October 22, 2025)",
      autoSyncCalendar: true
    }
  },

  // Calendar Data - Days with events in October 2025
  calendarEvents: {
    2025: {
      10: [1, 2, 3, 6, 7, 8, 9, 10, 13, 14, 16, 17, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
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
    return newTask;
  },

  // Update event
  updateEvent(id, updates) {
    const index = this.events.findIndex(event => event.id === id);
    if (index !== -1) {
      this.events[index] = {...this.events[index], ...updates};
      return this.events[index];
    }
    return null;
  },

  // Update task
  updateTask(id, updates) {
    const index = this.tasks.findIndex(task => task.id === id);
    if (index !== -1) {
      this.tasks[index] = {...this.tasks[index], ...updates};
      return this.tasks[index];
    }
    return null;
  },

  // Delete event
  deleteEvent(id) {
    const index = this.events.findIndex(event => event.id === id);
    if (index !== -1) {
      this.events.splice(index, 1);
      return true;
    }
    return false;
  },

  // Delete task
  deleteTask(id) {
    const index = this.tasks.findIndex(task => task.id === id);
    if (index !== -1) {
      this.tasks.splice(index, 1);
      return true;
    }
    return false;
  }
};

// Make AppData globally available
if (typeof window !== 'undefined') {
  window.AppData = AppData;
}
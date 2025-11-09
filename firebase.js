// Configuración de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
  getDatabase, 
  ref, 
  get, 
  child, 
  set, 
  push, 
  update, 
  remove 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
  getAuth, 
  signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyACzrjRLUoqr0lSPc93TlAnxmkbpdl-blA",
  authDomain: "finanzas-a4384.firebaseapp.com",
  databaseURL: "https://finanzas-a4384-default-rtdb.firebaseio.com",
  projectId: "finanzas-a4384",
  storageBucket: "finanzas-a4384.firebasestorage.app",
  messagingSenderId: "95140101833",
  appId: "1:95140101833:web:f76fad96671a4c62369718",
  measurementId: "G-SWXZ98DXE6"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Clase base para manejar datos en Firebase
class FirebaseManager {
  constructor(path) {
    this.path = path;
    this.ref = ref(database, path);
  }

  async getAll() {
    try {
      const snapshot = await get(this.ref);
      const data = snapshot.val() || {};
      return Object.entries(data).map(([id, item]) => ({ id, ...item }));
    } catch (error) {
      console.error('Error en getAll:', error);
      return [];
    }
  }

  async getById(id) {
    try {
      const snapshot = await get(child(this.ref, id));
      const data = snapshot.val();
      return data ? { id, ...data } : null;
    } catch (error) {
      console.error('Error en getById:', error);
      return null;
    }
  }

  async add(data) {
    try {
      const newRef = push(this.ref);
      await set(newRef, data);
      return { id: newRef.key, ...data };
    } catch (error) {
      console.error('Error en add:', error);
      return null;
    }
  }

  async update(id, data) {
    try {
      await update(child(this.ref, id), data);
      return { id, ...data };
    } catch (error) {
      console.error('Error en update:', error);
      return null;
    }
  }

  async delete(id) {
    try {
      await remove(child(this.ref, id));
      return true;
    } catch (error) {
      console.error('Error en delete:', error);
      return false;
    }
  }

  async getCurrent() {
    try {
      const allItems = await this.getAll();
      return allItems.find(item => !item.endDate) || null;
    } catch (error) {
      console.error('Error en getCurrent:', error);
      return null;
    }
  }
}

// Clase para manejar la lógica de los ciclos financieros
class FinancialCycle extends FirebaseManager {
  constructor(userId) {
    super(`users/${userId}/financialCycles`);
    this.categories = [
      'Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 
      'Salud', 'Educación', 'Ropa', 'Hogar', 'Otros'
    ];
  }

  async startNewCycle(name, amount, notes = '') {
    const newCycle = {
      name,
      initialAmount: parseFloat(amount),
      remainingAmount: parseFloat(amount),
      totalSpent: 0,
      startDate: new Date().toISOString(),
      endDate: null,
      expenses: [],
      notes
    };
    
    return await this.add(newCycle);
  }

  async endCurrentCycle(cycleId) {
    if (!cycleId) return false;
    return await this.update(cycleId, { endDate: new Date().toISOString() });
  }

  async addExpense(cycleId, amount, category, date, description = '', isRecurrent = false) {
    if (!cycleId) return null;
    
    const cycle = await this.getById(cycleId);
    if (!cycle) return null;

    const dateObj = new Date(date);
    dateObj.setDate(dateObj.getDate() + 1);
    const correctedDate = dateObj.toISOString().split('T')[0];

    const expense = {
      id: Date.now().toString(),
      amount: parseFloat(amount),
      category,
      date: correctedDate,
      description,
      isRecurrent,
      createdAt: new Date().toISOString()
    };

    const updatedExpenses = [...(cycle.expenses || []), expense];
    const totalSpent = (cycle.totalSpent || 0) + expense.amount;
    const remainingAmount = (cycle.remainingAmount || cycle.initialAmount) - expense.amount;

    const updateData = {
      expenses: updatedExpenses,
      totalSpent: totalSpent,
      remainingAmount: remainingAmount
    };

    const result = await this.update(cycleId, updateData);
    return result ? expense : null;
  }

  async deleteExpense(cycleId, expenseId) {
    if (!cycleId) return false;
    
    const cycle = await this.getById(cycleId);
    if (!cycle || !cycle.expenses) return false;
    
    const expenseIndex = cycle.expenses.findIndex(e => e.id === expenseId);
    if (expenseIndex === -1) return false;
    
    const expense = cycle.expenses[expenseIndex];
    const updatedExpenses = cycle.expenses.filter(e => e.id !== expenseId);
    const totalSpent = cycle.totalSpent - expense.amount;
    const remainingAmount = cycle.remainingAmount + expense.amount;
    
    const updateData = {
      expenses: updatedExpenses,
      totalSpent: totalSpent,
      remainingAmount: remainingAmount
    };
    
    const result = await this.update(cycleId, updateData);
    return !!result;
  }

  async getExpensesSummary(cycleId) {
    const cycle = await this.getById(cycleId);
    if (!cycle) return null;
    
    const totalSpent = cycle.totalSpent || 0;
    const initialAmount = cycle.initialAmount || 0;
    const remainingAmount = cycle.remainingAmount || initialAmount;
    const percentageSpent = initialAmount > 0 ? Math.round(totalSpent / initialAmount * 100) : 0;
    
    return {
      initialAmount: initialAmount,
      remainingAmount: remainingAmount,
      totalSpent: totalSpent,
      percentageSpent: percentageSpent
    };
  }

  async getExpensesByCategory(cycleId) {
    const cycle = await this.getById(cycleId);
    if (!cycle || !cycle.expenses) return [];
    
    const categoryMap = {};
    cycle.expenses.forEach(expense => {
      if (!categoryMap[expense.category]) {
        categoryMap[expense.category] = 0;
      }
      categoryMap[expense.category] += expense.amount;
    });
    
    return Object.entries(categoryMap).map(([category, amount]) => ({
      category,
      amount
    }));
  }

  async compareWithPreviousCycle(currentCycleId) {
    const allCycles = await this.getAll();
    if (allCycles.length < 2) return null;
    
    const currentIndex = allCycles.findIndex(c => c.id === currentCycleId);
    if (currentIndex === -1 || currentIndex === 0) return null;
    
    const current = allCycles[currentIndex];
    const previous = allCycles[currentIndex - 1];
    
    const currentSpent = current.totalSpent || 0;
    const previousSpent = previous.totalSpent || 0;
    
    const amountDiff = currentSpent - previousSpent;
    const percentageDiff = previousSpent > 0 ? (amountDiff / previousSpent * 100).toFixed(2) : 0;
    
    return {
      amountDiff,
      percentageDiff
    };
  }

  addCategory(newCategory) {
    if (!this.categories.includes(newCategory)) {
      this.categories.push(newCategory);
      return true;
    }
    return false;
  }
}

// Clase para manejar la lógica de los viáticos
class TripManager extends FirebaseManager {
  constructor(userId) {
    super(`users/${userId}/trips`);
    this.tripCategories = [
      'Hotel', 'Alimentación', 'Transporte', 'Materiales', 'Otros'
    ];
  }

  async startNewTrip(name, amount, startDate, notes = '') {
    const newTrip = {
      name,
      initialAmount: parseFloat(amount),
      remainingAmount: parseFloat(amount),
      totalSpent: 0,
      startDate,
      endDate: null,
      expenses: [],
      notes
    };
    
    return await this.add(newTrip);
  }

  async endCurrentTrip(tripId) {
    if (!tripId) return false;
    return await this.update(tripId, { endDate: new Date().toISOString() });
  }

  async addTripExpense(tripId, amount, category, date, description = '') {
    if (!tripId) return null;
    
    const trip = await this.getById(tripId);
    if (!trip) return null;

    const dateObj = new Date(date);
    dateObj.setDate(dateObj.getDate() + 1);
    const correctedDate = dateObj.toISOString().split('T')[0];

    const expense = {
      id: Date.now().toString(),
      amount: parseFloat(amount),
      category,
      date: correctedDate,
      description,
      createdAt: new Date().toISOString()
    };

    const updatedExpenses = [...(trip.expenses || []), expense];
    const totalSpent = (trip.totalSpent || 0) + expense.amount;
    const remainingAmount = (trip.remainingAmount || trip.initialAmount) - expense.amount;

    const updateData = {
      expenses: updatedExpenses,
      totalSpent: totalSpent,
      remainingAmount: remainingAmount
    };

    const result = await this.update(tripId, updateData);
    return result ? expense : null;
  }

  async deleteTripExpense(tripId, expenseId) {
    if (!tripId) return false;
    
    const trip = await this.getById(tripId);
    if (!trip || !trip.expenses) return false;
    
    const expenseIndex = trip.expenses.findIndex(e => e.id === expenseId);
    if (expenseIndex === -1) return false;
    
    const expense = trip.expenses[expenseIndex];
    const updatedExpenses = trip.expenses.filter(e => e.id !== expenseId);
    const totalSpent = trip.totalSpent - expense.amount;
    const remainingAmount = trip.remainingAmount + expense.amount;
    
    const updateData = {
      expenses: updatedExpenses,
      totalSpent: totalSpent,
      remainingAmount: remainingAmount
    };
    
    const result = await this.update(tripId, updateData);
    return !!result;
  }

  async getTripSummary(tripId) {
    const trip = await this.getById(tripId);
    if (!trip) return null;
    
    const totalSpent = trip.totalSpent || 0;
    const initialAmount = trip.initialAmount || 0;
    const remainingAmount = trip.remainingAmount || initialAmount;
    const percentageSpent = initialAmount > 0 ? Math.round(totalSpent / initialAmount * 100) : 0;
    
    return {
      initialAmount: initialAmount,
      remainingAmount: remainingAmount,
      totalSpent: totalSpent,
      percentageSpent: percentageSpent
    };
  }

  async getExpensesByCategory(tripId) {
    const trip = await this.getById(tripId);
    if (!trip || !trip.expenses) return [];
    
    const categoryMap = {};
    trip.expenses.forEach(expense => {
      if (!categoryMap[expense.category]) {
        categoryMap[expense.category] = 0;
      }
      categoryMap[expense.category] += expense.amount;
    });
    
    return Object.entries(categoryMap).map(([category, amount]) => ({
      category,
      amount
    }));
  }

  async compareWithPreviousTrip(currentTripId) {
    const allTrips = await this.getAll();
    if (allTrips.length < 2) return null;
    
    const currentIndex = allTrips.findIndex(t => t.id === currentTripId);
    if (currentIndex === -1 || currentIndex === 0) return null;
    
    const current = allTrips[currentIndex];
    const previous = allTrips[currentIndex - 1];
    
    const currentSpent = current.totalSpent || 0;
    const previousSpent = previous.totalSpent || 0;
    
    const amountDiff = currentSpent - previousSpent;
    const percentageDiff = previousSpent > 0 ? (amountDiff / previousSpent * 100).toFixed(2) : 0;
    
    return {
      amountDiff,
      percentageDiff
    };
  }

  addTripCategory(newCategory) {
    if (!this.tripCategories.includes(newCategory)) {
      this.tripCategories.push(newCategory);
      return true;
    }
    return false;
  }
}

// Funciones de utilidad
function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('es-ES', options);
  } catch (error) {
    return dateString;
  }
}

function formatCurrency(amount) {
  if (isNaN(amount)) return '$0';
  return '$' + amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// === SOLAMENTE ESTA LÍNEA DE EXPORTACIÓN - NO MÁS ===
export { auth, signInAnonymously, FinancialCycle, TripManager, formatDate, formatCurrency };
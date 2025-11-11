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
  remove,
  onValue 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { 
  getAuth, 
  signInAnonymously,
  onAuthStateChanged
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

// Clase para manejar datos en Firebase
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
      return snapshot.val();
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

  // Escuchar cambios en tiempo real
  onDataChange(callback) {
    return onValue(this.ref, (snapshot) => {
      const data = snapshot.val() || {};
      const items = Object.entries(data).map(([id, item]) => ({ id, ...item }));
      callback(items);
    });
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
      notes,
      createdAt: new Date().toISOString()
    };
    
    return await this.add(newCycle);
  }

  async endCurrentCycle(cycleId) {
    if (!cycleId) return false;
    return await this.update(cycleId, { 
      endDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  async addExpense(cycleId, amount, category, date, description = '', isRecurrent = false) {
    if (!cycleId) return null;
    
    const cycle = await this.getById(cycleId);
    if (!cycle) return null;

    const expense = {
      id: Date.now().toString(),
      amount: parseFloat(amount),
      category,
      date,
      description,
      isRecurrent,
      createdAt: new Date().toISOString()
    };

    const updatedExpenses = [...(cycle.expenses || []), expense];
    const totalSpent = cycle.totalSpent + expense.amount;
    const remainingAmount = cycle.remainingAmount - expense.amount;

    await this.update(cycleId, {
      expenses: updatedExpenses,
      totalSpent,
      remainingAmount,
      updatedAt: new Date().toISOString()
    });

    return expense;
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
    
    await this.update(cycleId, {
      expenses: updatedExpenses,
      totalSpent,
      remainingAmount,
      updatedAt: new Date().toISOString()
    });
    
    return true;
  }

  async getCurrentCycle() {
    try {
      const allCycles = await this.getAll();
      return allCycles.find(cycle => !cycle.endDate) || null;
    } catch (error) {
      console.error('Error en getCurrentCycle:', error);
      return null;
    }
  }

  async getExpensesSummary(cycleId) {
    const cycle = await this.getById(cycleId);
    if (!cycle) return null;
    
    return {
      initialAmount: cycle.initialAmount,
      remainingAmount: cycle.remainingAmount,
      totalSpent: cycle.totalSpent,
      percentageSpent: Math.round(cycle.totalSpent / cycle.initialAmount * 100)
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
    
    const amountDiff = current.totalSpent - previous.totalSpent;
    const percentageDiff = (amountDiff / previous.totalSpent * 100).toFixed(2);
    
    return {
      amountDiff,
      percentageDiff
    };
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
      notes,
      createdAt: new Date().toISOString()
    };
    
    return await this.add(newTrip);
  }

  async endCurrentTrip(tripId) {
    if (!tripId) return false;
    return await this.update(tripId, { 
      endDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  async addTripExpense(tripId, amount, category, date, description = '') {
    if (!tripId) return null;
    
    const trip = await this.getById(tripId);
    if (!trip) return null;

    const expense = {
      id: Date.now().toString(),
      amount: parseFloat(amount),
      category,
      date,
      description,
      createdAt: new Date().toISOString()
    };

    const updatedExpenses = [...(trip.expenses || []), expense];
    const totalSpent = trip.totalSpent + expense.amount;
    const remainingAmount = trip.remainingAmount - expense.amount;

    await this.update(tripId, {
      expenses: updatedExpenses,
      totalSpent,
      remainingAmount,
      updatedAt: new Date().toISOString()
    });

    return expense;
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
    
    await this.update(tripId, {
      expenses: updatedExpenses,
      totalSpent,
      remainingAmount,
      updatedAt: new Date().toISOString()
    });
    
    return true;
  }

  async getCurrentTrip() {
    try {
      const allTrips = await this.getAll();
      return allTrips.find(trip => !trip.endDate) || null;
    } catch (error) {
      console.error('Error en getCurrentTrip:', error);
      return null;
    }
  }

  async getTripSummary(tripId) {
    const trip = await this.getById(tripId);
    if (!trip) return null;
    
    return {
      initialAmount: trip.initialAmount,
      remainingAmount: trip.remainingAmount,
      totalSpent: trip.totalSpent,
      percentageSpent: Math.round(trip.totalSpent / trip.initialAmount * 100)
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
    
    const amountDiff = current.totalSpent - previous.totalSpent;
    const percentageDiff = (amountDiff / previous.totalSpent * 100).toFixed(2);
    
    return {
      amountDiff,
      percentageDiff
    };
  }
}

// Sistema de autenticación y gestión de usuario
class AppManager {
  constructor() {
    this.userId = null;
    this.financialCycle = null;
    this.tripManager = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Iniciar sesión anónima
      const userCredential = await signInAnonymously(auth);
      this.userId = userCredential.user.uid;
      
      // Inicializar managers
      this.financialCycle = new FinancialCycle(this.userId);
      this.tripManager = new TripManager(this.userId);
      
      this.isInitialized = true;
      console.log('App inicializada con usuario:', this.userId);
      
      return true;
    } catch (error) {
      console.error('Error inicializando la app:', error);
      return false;
    }
  }

  getUserId() {
    return this.userId;
  }

  isReady() {
    return this.isInitialized && this.userId !== null;
  }
}

// Funciones de utilidad
function formatDate(dateString) {
  if (!dateString) return '';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('es-ES', options);
}

function formatCurrency(amount) {
  if (isNaN(amount)) return '$0';
  return '$' + amount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Exportar clases y funciones
export { 
  database, 
  auth, 
  signInAnonymously,
  onAuthStateChanged,
  AppManager,
  FinancialCycle, 
  TripManager, 
  formatDate, 
  formatCurrency 
};
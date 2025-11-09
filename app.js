// Importar Firebase
import { 
  auth, 
  signInAnonymously, 
  FinancialCycle, 
  TripManager, 
  formatDate, 
  formatCurrency 
} from './firebase.js';

// Variables globales
let currentTab = 'personal';
let showingAllExpenses = false;
let showingAllTripExpenses = false;
let categoryChart = null;
let tripCategoryChart = null;
let financialCycle, tripManager;
let userId = null;

// Inicialización de Firebase y aplicación
async function initFirebase() {
    try {
        // Iniciar sesión anónima
        const userCredential = await signInAnonymously(auth);
        userId = userCredential.user.uid;
        
        // Inicializar managers con el userId
        financialCycle = new FinancialCycle(userId);
        tripManager = new TripManager(userId);
        
        console.log('Firebase inicializado correctamente');
        return true;
    } catch (error) {
        console.error('Error inicializando Firebase:', error);
        // Fallback a localStorage
        initLocalStorageFallback();
        return false;
    }
}

// Fallback a localStorage si Firebase falla
function initLocalStorageFallback() {
    console.log('Usando localStorage como fallback');
    
    // Clase FinancialCycle para fallback
    financialCycle = new (class FinancialCycle {
        constructor() {
            this.cycles = JSON.parse(localStorage.getItem('financialCycles')) || [];
            this.currentCycle = JSON.parse(localStorage.getItem('currentFinancialCycle')) || null;
            this.categories = JSON.parse(localStorage.getItem('expenseCategories')) || [
                'Alimentación', 'Transporte', 'Servicios', 'Entretenimiento', 
                'Salud', 'Educación', 'Ropa', 'Hogar', 'Otros'
            ];
        }

        async getCurrent() {
            return this.currentCycle;
        }

        async getAll() {
            return this.cycles;
        }

        async getById(id) {
            return this.cycles.find(cycle => cycle.id === id) || null;
        }

        async startNewCycle(name, amount, notes = '') {
            const newCycle = {
                id: Date.now().toString(),
                name,
                initialAmount: parseFloat(amount),
                remainingAmount: parseFloat(amount),
                totalSpent: 0,
                startDate: new Date().toISOString(),
                endDate: null,
                expenses: [],
                notes
            };
            
            this.currentCycle = newCycle;
            this.cycles.push(newCycle);
            this.saveData();
            return newCycle;
        }

        async endCurrentCycle(cycleId) {
            if (!this.currentCycle) return false;
            
            this.currentCycle.endDate = new Date().toISOString();
            this.currentCycle = null;
            this.saveData();
            return true;
        }

        async addExpense(cycleId, amount, category, date, description = '', isRecurrent = false) {
            if (!this.currentCycle) return null;
            
            const expense = {
                id: Date.now().toString(),
                amount: parseFloat(amount),
                category,
                date,
                description,
                isRecurrent,
                createdAt: new Date().toISOString()
            };
            
            this.currentCycle.expenses.push(expense);
            this.currentCycle.totalSpent += expense.amount;
            this.currentCycle.remainingAmount -= expense.amount;
            
            this.saveData();
            return expense;
        }

        async deleteExpense(cycleId, expenseId) {
            if (!this.currentCycle) return false;
            
            const expenseIndex = this.currentCycle.expenses.findIndex(e => e.id === expenseId);
            if (expenseIndex === -1) return false;
            
            const expense = this.currentCycle.expenses[expenseIndex];
            this.currentCycle.totalSpent -= expense.amount;
            this.currentCycle.remainingAmount += expense.amount;
            this.currentCycle.expenses.splice(expenseIndex, 1);
            
            this.saveData();
            return true;
        }

        async getExpensesSummary(cycleId) {
            if (!this.currentCycle) return null;
            
            return {
                initialAmount: this.currentCycle.initialAmount,
                remainingAmount: this.currentCycle.remainingAmount,
                totalSpent: this.currentCycle.totalSpent,
                percentageSpent: Math.round(this.currentCycle.totalSpent / this.currentCycle.initialAmount * 100)
            };
        }

        async getExpensesByCategory(cycleId) {
            if (!this.currentCycle) return [];
            
            const categoryMap = {};
            this.currentCycle.expenses.forEach(expense => {
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
            if (!this.currentCycle || this.cycles.length < 2) return null;
            
            const previous = this.cycles[this.cycles.length - 2];
            const amountDiff = this.currentCycle.totalSpent - previous.totalSpent;
            const percentageDiff = (amountDiff / previous.totalSpent * 100).toFixed(2);
            
            return {
                amountDiff,
                percentageDiff
            };
        }

        saveData() {
            localStorage.setItem('financialCycles', JSON.stringify(this.cycles));
            localStorage.setItem('currentFinancialCycle', JSON.stringify(this.currentCycle));
            localStorage.setItem('expenseCategories', JSON.stringify(this.categories));
        }
    })();

    // Clase TripManager para fallback
    tripManager = new (class TripManager {
        constructor() {
            this.trips = JSON.parse(localStorage.getItem('trips')) || [];
            this.currentTrip = JSON.parse(localStorage.getItem('currentTrip')) || null;
            this.tripCategories = JSON.parse(localStorage.getItem('tripCategories')) || [
                'Hotel', 'Alimentación', 'Transporte', 'Materiales', 'Otros'
            ];
        }

        async getCurrent() {
            return this.currentTrip;
        }

        async getAll() {
            return this.trips;
        }

        async getById(id) {
            return this.trips.find(trip => trip.id === id) || null;
        }

        async startNewTrip(name, amount, startDate, notes = '') {
            const newTrip = {
                id: Date.now().toString(),
                name,
                initialAmount: parseFloat(amount),
                remainingAmount: parseFloat(amount),
                totalSpent: 0,
                startDate,
                endDate: null,
                expenses: [],
                notes
            };
            
            this.currentTrip = newTrip;
            this.trips.push(newTrip);
            this.saveData();
            return newTrip;
        }

        async endCurrentTrip(tripId) {
            if (!this.currentTrip) return false;
            
            this.currentTrip.endDate = new Date().toISOString();
            this.currentTrip = null;
            this.saveData();
            return true;
        }

        async addTripExpense(tripId, amount, category, date, description = '') {
            if (!this.currentTrip) return null;
            
            const expense = {
                id: Date.now().toString(),
                amount: parseFloat(amount),
                category,
                date,
                description,
                createdAt: new Date().toISOString()
            };
            
            this.currentTrip.expenses.push(expense);
            this.currentTrip.totalSpent += expense.amount;
            this.currentTrip.remainingAmount -= expense.amount;
            
            this.saveData();
            return expense;
        }

        async deleteTripExpense(tripId, expenseId) {
            if (!this.currentTrip) return false;
            
            const expenseIndex = this.currentTrip.expenses.findIndex(e => e.id === expenseId);
            if (expenseIndex === -1) return false;
            
            const expense = this.currentTrip.expenses[expenseIndex];
            this.currentTrip.totalSpent -= expense.amount;
            this.currentTrip.remainingAmount += expense.amount;
            this.currentTrip.expenses.splice(expenseIndex, 1);
            
            this.saveData();
            return true;
        }

        async getTripSummary(tripId) {
            if (!this.currentTrip) return null;
            
            return {
                initialAmount: this.currentTrip.initialAmount,
                remainingAmount: this.currentTrip.remainingAmount,
                totalSpent: this.currentTrip.totalSpent,
                percentageSpent: Math.round(this.currentTrip.totalSpent / this.currentTrip.initialAmount * 100)
            };
        }

        async getExpensesByCategory(tripId) {
            if (!this.currentTrip) return [];
            
            const categoryMap = {};
            this.currentTrip.expenses.forEach(expense => {
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
            if (!this.currentTrip || this.trips.length < 2) return null;
            
            const previous = this.trips[this.trips.length - 2];
            const amountDiff = this.currentTrip.totalSpent - previous.totalSpent;
            const percentageDiff = (amountDiff / previous.totalSpent * 100).toFixed(2);
            
            return {
                amountDiff,
                percentageDiff
            };
        }

        saveData() {
            localStorage.setItem('trips', JSON.stringify(this.trips));
            localStorage.setItem('currentTrip', JSON.stringify(this.currentTrip));
            localStorage.setItem('tripCategories', JSON.stringify(this.tripCategories));
        }
    })();
    
    userId = 'local-user';
}

// DOM Elements
const themeBtn = document.getElementById('themeBtn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const newCycleBtn = document.getElementById('newCycleBtn');
const newCycleModal = document.getElementById('newCycleModal');
const newCycleForm = document.getElementById('newCycleForm');
const expenseForm = document.getElementById('expenseForm');
const showMoreExpenses = document.getElementById('showMoreExpenses');
const exportPersonalBtn = document.getElementById('exportPersonalBtn');
const exportModal = document.getElementById('exportModal');
const exportOptions = document.querySelectorAll('.export-options button');
const newTripBtn = document.getElementById('newTripBtn');
const newTripModal = document.getElementById('newTripModal');
const newTripForm = document.getElementById('newTripForm');
const tripExpenseForm = document.getElementById('tripExpenseForm');
const showMoreTripExpenses = document.getElementById('showMoreTripExpenses');
const exportTripBtn = document.getElementById('exportTripBtn');

// Event Listeners
document.addEventListener('DOMContentLoaded', initApp);
themeBtn.addEventListener('click', toggleTheme);
tabButtons.forEach(btn => btn.addEventListener('click', switchTab));
newCycleBtn.addEventListener('click', () => newCycleModal.style.display = 'block');
newCycleForm.addEventListener('submit', handleNewCycleSubmit);
expenseForm.addEventListener('submit', handleExpenseSubmit);
showMoreExpenses.addEventListener('click', toggleShowAllExpenses);
exportPersonalBtn.addEventListener('click', () => {
    currentTab = 'personal';
    exportModal.style.display = 'block';
});
exportOptions.forEach(btn => btn.addEventListener('click', handleExport));
document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        newCycleModal.style.display = 'none';
        newTripModal.style.display = 'none';
        exportModal.style.display = 'none';
    });
});
newTripBtn.addEventListener('click', () => newTripModal.style.display = 'block');
newTripForm.addEventListener('submit', handleNewTripSubmit);
tripExpenseForm.addEventListener('submit', handleTripExpenseSubmit);
showMoreTripExpenses.addEventListener('click', toggleShowAllTripExpenses);
exportTripBtn.addEventListener('click', () => {
    currentTab = 'viaticos';
    exportModal.style.display = 'block';
});

// Cerrar modales al hacer clic fuera
window.addEventListener('click', (e) => {
    if (e.target === newCycleModal) newCycleModal.style.display = 'none';
    if (e.target === newTripModal) newTripModal.style.display = 'none';
    if (e.target === exportModal) exportModal.style.display = 'none';
});

// Inicialización de la aplicación
async function initApp() {
    // Inicializar Firebase primero
    const firebaseSuccess = await initFirebase();
    
    if (!firebaseSuccess) {
        alert('Error conectando con la base de datos. Los datos se guardarán localmente.');
    }

    // Verificar tema guardado
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        themeBtn.innerHTML = '<i class="fas fa-sun"></i>';
    }

    // Configurar fecha actual como valor predeterminado
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today;
    document.getElementById('tripExpenseDate').value = today;
    document.getElementById('tripStartDate').value = today;

    // Cargar datos iniciales
    await loadPersonalFinanceData();
    await loadTripsData();

    // Configurar filtros
    setupFilters();

    // Mostrar pestaña personal por defecto
    document.querySelector('.tab-btn[data-tab="personal"]').classList.add('active');
    document.getElementById('personal').classList.add('active');
}

// Cambiar tema claro/oscuro
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDarkMode);
    themeBtn.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    
    // Actualizar gráficos para que coincidan con el tema
    if (categoryChart) updateCategoryChart();
    if (tripCategoryChart) updateTripCategoryChart();
}

// Cambiar entre pestañas
function switchTab(e) {
    const tabId = e.target.dataset.tab;
    currentTab = tabId;
    
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabId) btn.classList.add('active');
    });
    
    tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === tabId) pane.classList.add('active');
    });
    
    // Actualizar la UI según la pestaña
    if (tabId === 'personal') {
        updatePersonalFinanceUI();
    } else if (tabId === 'viaticos') {
        updateTripsUI();
    }
}

// Configurar opciones de categorías en los select
function setupFilters() {
    const expenseCategorySelect = document.getElementById('expenseCategory');
    const categoryFilterSelect = document.getElementById('categoryFilter');
    const tripExpenseCategorySelect = document.getElementById('tripExpenseCategory');
    const tripCategoryFilterSelect = document.getElementById('tripCategoryFilter');

    // Limpiar opciones existentes
    expenseCategorySelect.innerHTML = '<option value="">Seleccione una categoría</option>';
    categoryFilterSelect.innerHTML = '<option value="">Todas las categorías</option>';
    tripExpenseCategorySelect.innerHTML = '<option value="">Seleccione una categoría</option>';
    tripCategoryFilterSelect.innerHTML = '<option value="">Todas las categorías</option>';

    // Agregar categorías de gastos personales
    financialCycle.categories.forEach(category => {
        expenseCategorySelect.innerHTML += `<option value="${category}">${category}</option>`;
        categoryFilterSelect.innerHTML += `<option value="${category}">${category}</option>`;
    });

    // Agregar categorías de viáticos
    tripManager.tripCategories.forEach(category => {
        tripExpenseCategorySelect.innerHTML += `<option value="${category}">${category}</option>`;
        tripCategoryFilterSelect.innerHTML += `<option value="${category}">${category}</option>`;
    });

    // Configurar event listeners para filtros
    document.getElementById('categoryFilter').addEventListener('change', filterExpenses);
    document.getElementById('dateFilter').addEventListener('change', filterExpenses);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    document.getElementById('tripCategoryFilter').addEventListener('change', filterTripExpenses);
    document.getElementById('tripDateFilter').addEventListener('change', filterTripExpenses);
    document.getElementById('resetTripFilters').addEventListener('click', resetTripFilters);
}

// Cargar datos de finanzas personales
async function loadPersonalFinanceData() {
    // Actualizar información del ciclo actual
    await updateCurrentCycleInfo();
    
    // Actualizar tabla de gastos
    await updateExpensesTable();
    
    // Actualizar historial de ciclos
    await updateCyclesHistory();
    
    // Actualizar gráfico de categorías
    await updateCategoryChart();
    
    // Actualizar comparación con ciclo anterior
    await updateCycleComparison();
}

// Actualizar información del ciclo actual
async function updateCurrentCycleInfo() {
    const currentCycle = await financialCycle.getCurrent();
    let summary = null;
    
    if (currentCycle) {
        summary = await financialCycle.getExpensesSummary(currentCycle.id);
    }
    
    if (currentCycle && summary) {
        document.getElementById('currentCycleName').textContent = currentCycle.name;
        document.getElementById('initialAmount').textContent = formatCurrency(summary.initialAmount);
        document.getElementById('remainingAmount').textContent = formatCurrency(summary.remainingAmount);
        document.getElementById('totalSpent').textContent = formatCurrency(summary.totalSpent);
        document.getElementById('percentageSpent').textContent = `${summary.percentageSpent}%`;
        
        // Cambiar color según el porcentaje gastado
        const percentageElement = document.getElementById('percentageSpent');
        const percentage = parseFloat(summary.percentageSpent);
        
        if (percentage > 90) {
            percentageElement.style.color = 'var(--danger)';
        } else if (percentage > 70) {
            percentageElement.style.color = 'var(--warning)';
        } else {
            percentageElement.style.color = 'var(--success)';
        }
    } else {
        document.getElementById('currentCycleName').textContent = 'No iniciado';
        document.getElementById('initialAmount').textContent = '$0';
        document.getElementById('remainingAmount').textContent = '$0';
        document.getElementById('totalSpent').textContent = '$0';
        document.getElementById('percentageSpent').textContent = '0%';
    }
}

// Actualizar tabla de gastos
async function updateExpensesTable(filteredExpenses = null) {
    const expensesTable = document.querySelector('#expensesTable tbody');
    expensesTable.innerHTML = '';
    
    const currentCycle = await financialCycle.getCurrent();
    let expenses = [];
    
    if (currentCycle && currentCycle.expenses) {
        expenses = [...currentCycle.expenses].reverse();
    }
    
    if (filteredExpenses) {
        expenses = filteredExpenses;
    }
    
    const expensesToShow = showingAllExpenses ? expenses : expenses.slice(0, 10);
    
    if (expensesToShow.length === 0) {
        expensesTable.innerHTML = '<tr><td colspan="5" class="no-expenses">No hay gastos registrados</td></tr>';
        showMoreExpenses.style.display = 'none';
        return;
    }
    
    expensesToShow.forEach(expense => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(expense.date)}</td>
            <td>${expense.category}</td>
            <td>${expense.description || '-'}</td>
            <td>${formatCurrency(expense.amount)}</td>
            <td>
                <button class="action-btn delete" data-id="${expense.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        expensesTable.appendChild(row);
    });
    
    // Mostrar u ocultar el botón "Ver más"
    showMoreExpenses.style.display = expenses.length > 10 && !showingAllExpenses ? 'block' : 'none';
    showMoreExpenses.textContent = showingAllExpenses ? 'Ver menos' : 'Ver más';
    
    // Agregar event listeners a los botones de eliminar
    document.querySelectorAll('#expensesTable .action-btn.delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const expenseId = e.currentTarget.dataset.id;
            const currentCycle = await financialCycle.getCurrent();
            if (currentCycle && confirm('¿Estás seguro de eliminar este gasto?')) {
                const success = await financialCycle.deleteExpense(currentCycle.id, expenseId);
                if (success) {
                    await updatePersonalFinanceUI();
                } else {
                    alert('Error al eliminar el gasto.');
                }
            }
        });
    });
}

// Alternar entre mostrar todos los gastos o solo los primeros 10
function toggleShowAllExpenses() {
    showingAllExpenses = !showingAllExpenses;
    updateExpensesTable();
}

// Actualizar historial de ciclos
async function updateCyclesHistory() {
    const historyTable = document.querySelector('#cyclesHistoryTable tbody');
    historyTable.innerHTML = '';
    
    const cycles = await financialCycle.getAll();
    
    if (cycles.length === 0) {
        historyTable.innerHTML = '<tr><td colspan="6" class="no-history">No hay historial de ciclos</td></tr>';
        return;
    }
    
    // Ordenar ciclos por fecha de inicio (más reciente primero)
    const sortedCycles = [...cycles].sort((a, b) => 
        new Date(b.startDate) - new Date(a.startDate));
    
    sortedCycles.forEach(cycle => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${cycle.name}</td>
            <td>${formatDate(cycle.startDate)}</td>
            <td>${formatCurrency(cycle.initialAmount)}</td>
            <td>${formatCurrency(cycle.totalSpent)}</td>
            <td>${formatCurrency(cycle.remainingAmount)}</td>
            <td>
                <button class="action-btn view" data-id="${cycle.id}">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        historyTable.appendChild(row);
    });
    
    // Agregar event listeners a los botones de ver
    document.querySelectorAll('#cyclesHistoryTable .action-btn.view').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const cycleId = e.currentTarget.dataset.id;
            const cycle = await financialCycle.getById(cycleId);
            if (cycle) {
                alert(`Detalles del ciclo: ${cycle.name}\n
Monto inicial: ${formatCurrency(cycle.initialAmount)}\n
Total gastado: ${formatCurrency(cycle.totalSpent)}\n
Monto restante: ${formatCurrency(cycle.remainingAmount)}\n
Notas: ${cycle.notes || 'Ninguna'}`);
            }
        });
    });
}

// Actualizar gráfico de categorías
async function updateCategoryChart() {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    
    if (categoryChart) {
        categoryChart.destroy();
    }
    
    const currentCycle = await financialCycle.getCurrent();
    if (!currentCycle || !currentCycle.expenses || currentCycle.expenses.length === 0) {
        document.getElementById('categoryChart').style.display = 'none';
        return;
    }
    
    document.getElementById('categoryChart').style.display = 'block';
    
    const data = await financialCycle.getExpensesByCategory(currentCycle.id);
    const labels = data.map(item => item.category);
    const amounts = data.map(item => item.amount);
    
    // Colores para el gráfico
    const backgroundColors = [
        'rgba(212, 175, 55, 0.7)',
        'rgba(192, 192, 192, 0.7)',
        'rgba(23, 42, 69, 0.7)',
        'rgba(10, 25, 47, 0.7)',
        'rgba(40, 167, 69, 0.7)',
        'rgba(220, 53, 69, 0.7)',
        'rgba(255, 193, 7, 0.7)',
        'rgba(108, 117, 125, 0.7)',
        'rgba(0, 123, 255, 0.7)'
    ];
    
    categoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: amounts,
                backgroundColor: backgroundColors,
                borderColor: document.body.classList.contains('dark-mode') ? '#444' : '#fff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: document.body.classList.contains('dark-mode') ? '#f8f8f8' : '#333'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Actualizar comparación con ciclo anterior
async function updateCycleComparison() {
    const currentCycle = await financialCycle.getCurrent();
    if (!currentCycle) {
        document.getElementById('cycleComparison').innerHTML = '<p>No hay datos suficientes para comparar</p>';
        return;
    }
    
    const comparison = await financialCycle.compareWithPreviousCycle(currentCycle.id);
    const comparisonElement = document.getElementById('cycleComparison');
    
    if (!comparison) {
        comparisonElement.innerHTML = '<p>No hay datos suficientes para comparar</p>';
        return;
    }
    
    const isMore = comparison.amountDiff >= 0;
    const absAmountDiff = Math.abs(comparison.amountDiff);
    const absPercentageDiff = Math.abs(comparison.percentageDiff);
    
    comparisonElement.innerHTML = `
        <p>Has gastado <strong class="${isMore ? 'more' : 'less'}">${formatCurrency(absAmountDiff)} ${isMore ? 'más' : 'menos'}</strong> que en el ciclo anterior.</p>
        <p>Esto representa un <strong class="${isMore ? 'more' : 'less'}">${absPercentageDiff}% ${isMore ? 'más' : 'menos'}</strong> en comparación.</p>
    `;
}

// Manejar nuevo ciclo financiero
async function handleNewCycleSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('cycleName').value;
    const amount = document.getElementById('cycleAmount').value;
    const notes = document.getElementById('cycleNotes').value;
    
    if (!name || !amount) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }
    
    const newCycle = await financialCycle.startNewCycle(name, amount, notes);
    if (newCycle) {
        newCycleModal.style.display = 'none';
        newCycleForm.reset();
        await updatePersonalFinanceUI();
    } else {
        alert('Error al crear el ciclo. Por favor intenta nuevamente.');
    }
}

// Manejar nuevo gasto
async function handleExpenseSubmit(e) {
    e.preventDefault();
    
    const currentCycle = await financialCycle.getCurrent();
    if (!currentCycle) {
        alert('Por favor inicia un ciclo financiero primero');
        return;
    }
    
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;
    const category = document.getElementById('expenseCategory').value;
    const description = document.getElementById('expenseDescription').value;
    const isRecurrent = document.getElementById('isRecurrent').checked;
    
    if (isNaN(amount) || !date || !category) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }
    
    const expense = await financialCycle.addExpense(currentCycle.id, amount, category, date, description, isRecurrent);
    if (expense) {
        expenseForm.reset();
        document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
        await updatePersonalFinanceUI();
    } else {
        alert('Error al agregar el gasto. Por favor intenta nuevamente.');
    }
}

// Filtrar gastos
async function filterExpenses() {
    const category = document.getElementById('categoryFilter').value;
    const date = document.getElementById('dateFilter').value;
    
    const currentCycle = await financialCycle.getCurrent();
    if (!currentCycle || !currentCycle.expenses) {
        updateExpensesTable([]);
        return;
    }
    
    let filtered = currentCycle.expenses;
    
    if (category) {
        filtered = filtered.filter(expense => expense.category === category);
    }
    
    if (date) {
        filtered = filtered.filter(expense => expense.date === date);
    }
    
    updateExpensesTable(filtered);
}

// Restablecer filtros
function resetFilters() {
    document.getElementById('categoryFilter').value = '';
    document.getElementById('dateFilter').value = '';
    updateExpensesTable();
}

// Actualizar toda la UI de finanzas personales
async function updatePersonalFinanceUI() {
    await updateCurrentCycleInfo();
    await updateExpensesTable();
    await updateCyclesHistory();
    await updateCategoryChart();
    await updateCycleComparison();
}

// Cargar datos de viáticos
async function loadTripsData() {
    // Actualizar información del viaje actual
    await updateCurrentTripInfo();
    
    // Actualizar tabla de gastos de viáticos
    await updateTripExpensesTable();
    
    // Actualizar historial de viajes
    await updateTripsHistory();
    
    // Actualizar comparación con viaje anterior
    await updateTripComparison();
}

// Actualizar información del viaje actual
async function updateCurrentTripInfo() {
    const currentTrip = await tripManager.getCurrent();
    let summary = null;
    
    if (currentTrip) {
        summary = await tripManager.getTripSummary(currentTrip.id);
    }
    
    if (currentTrip && summary) {
        document.getElementById('currentTripName').textContent = currentTrip.name;
        document.getElementById('tripInitialAmount').textContent = formatCurrency(summary.initialAmount);
        document.getElementById('tripRemainingAmount').textContent = formatCurrency(summary.remainingAmount);
        document.getElementById('tripTotalSpent').textContent = formatCurrency(summary.totalSpent);
        document.getElementById('tripPercentageSpent').textContent = `${summary.percentageSpent}%`;
        
        // Cambiar color según el porcentaje gastado
        const percentageElement = document.getElementById('tripPercentageSpent');
        const percentage = parseFloat(summary.percentageSpent);
        
        if (percentage > 90) {
            percentageElement.style.color = 'var(--danger)';
        } else if (percentage > 70) {
            percentageElement.style.color = 'var(--warning)';
        } else {
            percentageElement.style.color = 'var(--success)';
        }
    } else {
        document.getElementById('currentTripName').textContent = 'No iniciada';
        document.getElementById('tripInitialAmount').textContent = '$0';
        document.getElementById('tripRemainingAmount').textContent = '$0';
        document.getElementById('tripTotalSpent').textContent = '$0';
        document.getElementById('tripPercentageSpent').textContent = '0%';
    }
}

// Actualizar tabla de gastos de viáticos
async function updateTripExpensesTable(filteredExpenses = null) {
    const expensesTable = document.querySelector('#tripExpensesTable tbody');
    expensesTable.innerHTML = '';
    
    const currentTrip = await tripManager.getCurrent();
    let expenses = [];
    
    if (currentTrip && currentTrip.expenses) {
        expenses = [...currentTrip.expenses].reverse();
    }
    
    if (filteredExpenses) {
        expenses = filteredExpenses;
    }
    
    const expensesToShow = showingAllTripExpenses ? expenses : expenses.slice(0, 10);
    
    if (expensesToShow.length === 0) {
        expensesTable.innerHTML = '<tr><td colspan="5" class="no-expenses">No hay gastos registrados</td></tr>';
        showMoreTripExpenses.style.display = 'none';
        return;
    }
    
    expensesToShow.forEach(expense => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(expense.date)}</td>
            <td>${expense.category}</td>
            <td>${expense.description || '-'}</td>
            <td>${formatCurrency(expense.amount)}</td>
            <td>
                <button class="action-btn delete" data-id="${expense.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        expensesTable.appendChild(row);
    });
    
    // Mostrar u ocultar el botón "Ver más"
    showMoreTripExpenses.style.display = expenses.length > 10 && !showingAllTripExpenses ? 'block' : 'none';
    showMoreTripExpenses.textContent = showingAllTripExpenses ? 'Ver menos' : 'Ver más';
    
    // Agregar event listeners a los botones de eliminar
    document.querySelectorAll('#tripExpensesTable .action-btn.delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const expenseId = e.currentTarget.dataset.id;
            const currentTrip = await tripManager.getCurrent();
            if (currentTrip && confirm('¿Estás seguro de eliminar este gasto?')) {
                const success = await tripManager.deleteTripExpense(currentTrip.id, expenseId);
                if (success) {
                    await updateTripsUI();
                } else {
                    alert('Error al eliminar el gasto.');
                }
            }
        });
    });
}

// Alternar entre mostrar todos los gastos de viáticos o solo los primeros 10
function toggleShowAllTripExpenses() {
    showingAllTripExpenses = !showingAllTripExpenses;
    updateTripExpensesTable();
}

// Actualizar historial de viajes
async function updateTripsHistory() {
    const historyTable = document.querySelector('#tripsHistoryTable tbody');
    historyTable.innerHTML = '';
    
    const trips = await tripManager.getAll();
    
    if (trips.length === 0) {
        historyTable.innerHTML = '<tr><td colspan="6" class="no-history">No hay historial de salidas</td></tr>';
        return;
    }
    
    // Ordenar viajes por fecha de inicio (más reciente primero)
    const sortedTrips = [...trips].sort((a, b) => 
        new Date(b.startDate) - new Date(a.startDate));
    
    sortedTrips.forEach(trip => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${trip.name}</td>
            <td>${formatDate(trip.startDate)}</td>
            <td>${formatCurrency(trip.initialAmount)}</td>
            <td>${formatCurrency(trip.totalSpent)}</td>
            <td>${formatCurrency(trip.remainingAmount)}</td>
            <td>
                <button class="action-btn view" data-id="${trip.id}">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        historyTable.appendChild(row);
    });
    
    // Agregar event listeners a los botones de ver
    document.querySelectorAll('#tripsHistoryTable .action-btn.view').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tripId = e.currentTarget.dataset.id;
            const trip = await tripManager.getById(tripId);
            if (trip) {
                alert(`Detalles de la salida: ${trip.name}\n
Monto asignado: ${formatCurrency(trip.initialAmount)}\n
Total gastado: ${formatCurrency(trip.totalSpent)}\n
Monto restante: ${formatCurrency(trip.remainingAmount)}\n
Notas: ${trip.notes || 'Ninguna'}`);
            }
        });
    });
}

// Actualizar comparación con viaje anterior
async function updateTripComparison() {
    const currentTrip = await tripManager.getCurrent();
    if (!currentTrip) {
        document.getElementById('tripComparison').innerHTML = '<p>No hay datos suficientes para comparar</p>';
        return;
    }
    
    const comparison = await tripManager.compareWithPreviousTrip(currentTrip.id);
    const comparisonElement = document.getElementById('tripComparison');
    
    if (!comparison) {
        comparisonElement.innerHTML = '<p>No hay datos suficientes para comparar</p>';
        return;
    }
    
    const isMore = comparison.amountDiff >= 0;
    const absAmountDiff = Math.abs(comparison.amountDiff);
    const absPercentageDiff = Math.abs(comparison.percentageDiff);
    
    comparisonElement.innerHTML = `
        <p>Has gastado <strong class="${isMore ? 'more' : 'less'}">${formatCurrency(absAmountDiff)} ${isMore ? 'más' : 'menos'}</strong> que en la salida anterior.</p>
        <p>Esto representa un <strong class="${isMore ? 'more' : 'less'}">${absPercentageDiff}% ${isMore ? 'más' : 'menos'}</strong> en comparación.</p>
    `;
}

// Manejar nuevo viaje
async function handleNewTripSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('tripName').value;
    const amount = document.getElementById('tripAmount').value;
    const startDate = document.getElementById('tripStartDate').value;
    const notes = document.getElementById('tripNotes').value;
    
    if (!name || !amount || !startDate) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }
    
    const newTrip = await tripManager.startNewTrip(name, amount, startDate, notes);
    if (newTrip) {
        newTripModal.style.display = 'none';
        newTripForm.reset();
        await updateTripsUI();
    } else {
        alert('Error al crear la salida. Por favor intenta nuevamente.');
    }
}

// Manejar nuevo gasto de viático
async function handleTripExpenseSubmit(e) {
    e.preventDefault();
    
    const currentTrip = await tripManager.getCurrent();
    if (!currentTrip) {
        alert('Por favor inicia una salida primero');
        return;
    }
    
    const amount = parseFloat(document.getElementById('tripExpenseAmount').value);
    const date = document.getElementById('tripExpenseDate').value;
    const category = document.getElementById('tripExpenseCategory').value;
    const description = document.getElementById('tripExpenseDescription').value;
    
    if (isNaN(amount) || !date || !category) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }
    
    const expense = await tripManager.addTripExpense(currentTrip.id, amount, category, date, description);
    if (expense) {
        tripExpenseForm.reset();
        document.getElementById('tripExpenseDate').value = new Date().toISOString().split('T')[0];
        await updateTripsUI();
    } else {
        alert('Error al agregar el gasto. Por favor intenta nuevamente.');
    }
}

// Filtrar gastos de viáticos
async function filterTripExpenses() {
    const category = document.getElementById('tripCategoryFilter').value;
    const date = document.getElementById('tripDateFilter').value;
    
    const currentTrip = await tripManager.getCurrent();
    if (!currentTrip || !currentTrip.expenses) {
        updateTripExpensesTable([]);
        return;
    }
    
    let filtered = currentTrip.expenses;
    
    if (category) {
        filtered = filtered.filter(expense => expense.category === category);
    }
    
    if (date) {
        filtered = filtered.filter(expense => expense.date === date);
    }
    
    updateTripExpensesTable(filtered);
}

// Restablecer filtros de viáticos
function resetTripFilters() {
    document.getElementById('tripCategoryFilter').value = '';
    document.getElementById('tripDateFilter').value = '';
    updateTripExpensesTable();
}

// Actualizar toda la UI de viáticos
async function updateTripsUI() {
    await updateCurrentTripInfo();
    await updateTripExpensesTable();
    await updateTripsHistory();
    await updateTripComparison();
}

// Manejar exportación de datos
function handleExport(e) {
    e.preventDefault();
    const exportType = e.currentTarget.id.replace('export', '').toLowerCase();
    
    if (currentTab === 'personal') {
        exportPersonalData(exportType);
    } else if (currentTab === 'viaticos') {
        exportTripData(exportType);
    }
    
    exportModal.style.display = 'none';
}

// Exportar datos personales
async function exportPersonalData(type) {
    const currentCycle = await financialCycle.getCurrent();
    const cycles = await financialCycle.getAll();
    
    if (!currentCycle && cycles.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const data = {
        currentCycle: currentCycle,
        cycles: cycles,
        categories: financialCycle.categories
    };
    
    switch (type) {
        case 'excel':
            exportToExcel(data, 'gastos_personales');
            break;
        case 'csv':
            exportToCSV(data, 'gastos_personales');
            break;
        case 'pdf':
            exportToPDF(data, 'Gastos Personales');
            break;
    }
}

// Exportar datos de viáticos
async function exportTripData(type) {
    const currentTrip = await tripManager.getCurrent();
    const trips = await tripManager.getAll();
    
    if (!currentTrip && trips.length === 0) {
        alert('No hay datos para exportar');
        return;
    }
    
    const data = {
        currentTrip: currentTrip,
        trips: trips,
        categories: tripManager.tripCategories
    };
    
    switch (type) {
        case 'excel':
            exportToExcel(data, 'viaticos');
            break;
        case 'csv':
            exportToCSV(data, 'viaticos');
            break;
        case 'pdf':
            exportToPDF(data, 'Viáticos');
            break;
    }
}

// Exportar a Excel
function exportToExcel(data, fileName) {
    try {
        // Crear un nuevo libro de trabajo
        const wb = XLSX.utils.book_new();
        
        // Hoja para el ciclo/viaje actual
        if (data.currentCycle || data.currentTrip) {
            const current = data.currentCycle || data.currentTrip;
            const currentData = [
                ['Nombre', current.name],
                ['Monto Inicial', current.initialAmount],
                ['Total Gastado', current.totalSpent],
                ['Monto Restante', current.remainingAmount],
                ['Fecha Inicio', formatDate(current.startDate)],
                ['Notas', current.notes || 'Ninguna'],
                [], // Espacio en blanco
                ['Gastos'] // Encabezado de sección
            ];
            
            // Agregar encabezados de gastos
            currentData.push(['Fecha', 'Categoría', 'Descripción', 'Monto']);
            
            // Agregar gastos
            if (current.expenses) {
                current.expenses.forEach(expense => {
                    currentData.push([
                        formatDate(expense.date),
                        expense.category,
                        expense.description || '',
                        expense.amount
                    ]);
                });
            }
            
            // Agregar hoja al libro
            const ws = XLSX.utils.aoa_to_sheet(currentData);
            XLSX.utils.book_append_sheet(wb, ws, 'Actual');
        }
        
        // Hoja para el historial
        if (data.cycles || data.trips) {
            const history = data.cycles || data.trips;
            const historyData = [
                ['Nombre', 'Fecha Inicio', 'Monto Inicial', 'Total Gastado', 'Monto Restante', 'Notas']
            ];
            
            history.forEach(item => {
                historyData.push([
                    item.name,
                    formatDate(item.startDate),
                    item.initialAmount,
                    item.totalSpent,
                    item.remainingAmount,
                    item.notes || ''
                ]);
            });
            
            // Agregar hoja al libro
            const ws = XLSX.utils.aoa_to_sheet(historyData);
            XLSX.utils.book_append_sheet(wb, ws, 'Historial');
        }
        
        // Hoja para categorías
        if (data.categories) {
            const categoriesData = [
                ['Categorías']
            ];
            
            data.categories.forEach(category => {
                categoriesData.push([category]);
            });
            
            // Agregar hoja al libro
            const ws = XLSX.utils.aoa_to_sheet(categoriesData);
            XLSX.utils.book_append_sheet(wb, ws, 'Categorías');
        }
        
        // Exportar el libro de trabajo
        XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
        console.error('Error al exportar a Excel:', error);
        alert('Error al exportar a Excel. Por favor intente nuevamente.');
    }
}

// Exportar a CSV
function exportToCSV(data, fileName) {
    try {
        let csvContent = "";
        
        // Datos del ciclo/viaje actual
        if (data.currentCycle || data.currentTrip) {
            const current = data.currentCycle || data.currentTrip;
            
            csvContent += "Datos del " + (data.currentCycle ? "Ciclo Actual" : "Viaje Actual") + "\n";
            csvContent += `Nombre,${current.name}\n`;
            csvContent += `Monto Inicial,${current.initialAmount}\n`;
            csvContent += `Total Gastado,${current.totalSpent}\n`;
            csvContent += `Monto Restante,${current.remainingAmount}\n`;
            csvContent += `Fecha Inicio,${formatDate(current.startDate)}\n`;
            csvContent += `Notas,${current.notes || 'Ninguna'}\n\n`;
            
            // Gastos
            csvContent += "Gastos\n";
            csvContent += "Fecha,Categoría,Descripción,Monto\n";
            
            if (current.expenses) {
                current.expenses.forEach(expense => {
                    csvContent += `${formatDate(expense.date)},${expense.category},${expense.description || ''},${expense.amount}\n`;
                });
            }
            
            csvContent += "\n";
        }
        
        // Historial
        if (data.cycles || data.trips) {
            csvContent += "Historial\n";
            csvContent += "Nombre,Fecha Inicio,Monto Inicial,Total Gastado,Monto Restante,Notas\n";
            
            const history = data.cycles || data.trips;
            history.forEach(item => {
                csvContent += `${item.name},${formatDate(item.startDate)},${item.initialAmount},${item.totalSpent},${item.remainingAmount},${item.notes || ''}\n`;
            });
            
            csvContent += "\n";
        }
        
        // Categorías
        if (data.categories) {
            csvContent += "Categorías\n";
            data.categories.forEach(category => {
                csvContent += `${category}\n`;
            });
        }
        
        // Crear y descargar el archivo
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${fileName}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error('Error al exportar a CSV:', error);
        alert('Error al exportar a CSV. Por favor intente nuevamente.');
    }
}

// Exportar a PDF
function exportToPDF(data, title) {
    try {
        // eslint-disable-next-line no-undef
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Configuración inicial
        doc.setFont('helvetica');
        doc.setFontSize(18);
        doc.setTextColor(40, 53, 147);
        doc.text(title, 105, 15, { align: 'center' });
        
        let yPosition = 30;
        
        // Datos del ciclo/viaje actual
        if (data.currentCycle || data.currentTrip) {
            const current = data.currentCycle || data.currentTrip;
            
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(data.currentCycle ? 'Ciclo Actual' : 'Viaje Actual', 14, yPosition);
            yPosition += 10;
            
            doc.setFontSize(12);
            doc.text(`Nombre: ${current.name}`, 14, yPosition);
            yPosition += 7;
            doc.text(`Monto Inicial: ${formatCurrency(current.initialAmount)}`, 14, yPosition);
            yPosition += 7;
            doc.text(`Total Gastado: ${formatCurrency(current.totalSpent)}`, 14, yPosition);
            yPosition += 7;
            doc.text(`Monto Restante: ${formatCurrency(current.remainingAmount)}`, 14, yPosition);
            yPosition += 7;
            doc.text(`Fecha Inicio: ${formatDate(current.startDate)}`, 14, yPosition);
            yPosition += 7;
            doc.text(`Notas: ${current.notes || 'Ninguna'}`, 14, yPosition);
            yPosition += 15;
            
            // Tabla de gastos
            if (current.expenses && current.expenses.length > 0) {
                doc.setFontSize(14);
                doc.text('Gastos', 14, yPosition);
                yPosition += 10;
                
                const headers = ['Fecha', 'Categoría', 'Descripción', 'Monto'];
                const rows = current.expenses.map(expense => [
                    formatDate(expense.date),
                    expense.category,
                    expense.description || '-',
                    formatCurrency(expense.amount)
                ]);
                
                doc.autoTable({
                    startY: yPosition,
                    head: [headers],
                    body: rows,
                    margin: { left: 14 },
                    styles: { fontSize: 10 },
                    headStyles: { fillColor: [23, 42, 69] }
                });
                
                yPosition = doc.lastAutoTable.finalY + 10;
            }
        }
        
        // Historial
        if (data.cycles || data.trips) {
            const history = data.cycles || data.trips;
            
            doc.setFontSize(14);
            doc.text('Historial', 14, yPosition);
            yPosition += 10;
            
            const headers = ['Nombre', 'Fecha Inicio', 'Monto Inicial', 'Total Gastado', 'Monto Restante'];
            const rows = history.map(item => [
                item.name,
                formatDate(item.startDate),
                formatCurrency(item.initialAmount),
                formatCurrency(item.totalSpent),
                formatCurrency(item.remainingAmount)
            ]);
            
            doc.autoTable({
                startY: yPosition,
                head: [headers],
                body: rows,
                margin: { left: 14 },
                styles: { fontSize: 10 },
                headStyles: { fillColor: [23, 42, 69] }
            });
            
            yPosition = doc.lastAutoTable.finalY + 10;
        }
        
        // Categorías
        if (data.categories) {
            doc.setFontSize(14);
            doc.text('Categorías', 14, yPosition);
            yPosition += 10;
            
            const headers = ['Nombre'];
            const rows = data.categories.map(category => [category]);
            
            doc.autoTable({
                startY: yPosition,
                head: [headers],
                body: rows,
                margin: { left: 14 },
                styles: { fontSize: 10 },
                headStyles: { fillColor: [23, 42, 69] }
            });
        }
        
        // Guardar el PDF
        doc.save(`${title.toLowerCase().replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error('Error al exportar a PDF:', error);
        alert('Error al exportar a PDF. Por favor intente nuevamente.');
    }
}
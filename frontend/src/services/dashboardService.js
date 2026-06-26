import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || '/api';

// Configuración base de axios
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Interceptor para agregar el token de autenticación
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Servicios del Dashboard
export const dashboardService = {
    // Obtener todos los datos del dashboard
    getDashboardData: async (period = 'month', type = 'full') => {
        try {
            const response = await api.get(`/dashboard?period=${period}&type=${type}`);
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    },

    // Obtener estadísticas rápidas
    getQuickStats: async () => {
        try {
            const response = await api.get('/dashboard?type=stats');
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    },

    // Obtener resumen del dashboard
    getDashboardSummary: async () => {
        try {
            const response = await api.get('/dashboard?type=summary');
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    },

    // Obtener rendimiento por sucursal
    getBranchPerformance: async (period = 'month') => {
        try {
            const response = await api.get(`/dashboard/branch-performance?period=${period}`);
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    },

    // Refrescar datos del dashboard
    refreshDashboard: async () => {
        try {
            const response = await api.get('/dashboard/refresh');
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    },

    // Obtener configuración del dashboard
    getDashboardConfig: async () => {
        try {
            const response = await api.get('/dashboard/config');
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    },

    // Actualizar configuración del dashboard
    updateDashboardConfig: async (config) => {
        try {
            const response = await api.put('/dashboard/config', config);
            return response.data;
        } catch (error) {
            throw handleError(error);
        }
    }
};

// Función para manejar errores
const handleError = (error) => {
    if (error.response) {
        // El servidor respondió con un código de estado fuera del rango 2xx
        return {
            status: error.response.status,
            message: error.response.data.message || 'Error en la petición',
            details: error.response.data.details
        };
    } else if (error.request) {
        // La petición fue hecha pero no se recibió respuesta
        return {
            status: 503,
            message: 'No se pudo conectar con el servidor',
            details: 'El servidor no está respondiendo'
        };
    } else {
        // Algo sucedió al configurar la petición
        return {
            status: 500,
            message: 'Error al procesar la petición',
            details: error.message
        };
    }
}; 
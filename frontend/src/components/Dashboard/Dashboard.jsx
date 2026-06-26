import React, { useState, useEffect } from 'react';
import { dashboardService } from '../../services/dashboardService';
import {
    Box,
    Grid,
    Card,
    CardContent,
    Typography,
    CircularProgress,
    Alert,
    Select,
    MenuItem,
    FormControl,
    InputLabel
} from '@mui/material';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('month');
    const [dashboardData, setDashboardData] = useState(null);

    // Función para cargar los datos del dashboard
    const loadDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await dashboardService.getDashboardData(period);
            setDashboardData(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Cargar datos iniciales
    useEffect(() => {
        loadDashboardData();
    }, [period]);

    // Manejar cambio de período
    const handlePeriodChange = (event) => {
        setPeriod(event.target.value);
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box m={3}>
                <Alert severity="error">{error}</Alert>
            </Box>
        );
    }

    return (
        <Box p={3}>
            {/* Selector de período */}
            <Box mb={3}>
                <FormControl variant="outlined" sx={{ minWidth: 200 }}>
                    <InputLabel>Período</InputLabel>
                    <Select
                        value={period}
                        onChange={handlePeriodChange}
                        label="Período"
                    >
                        <MenuItem value="today">Hoy</MenuItem>
                        <MenuItem value="week">Esta semana</MenuItem>
                        <MenuItem value="month">Este mes</MenuItem>
                        <MenuItem value="year">Este año</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Estadísticas principales */}
            <Grid container spacing={3} mb={3}>
                {/* Ventas */}
                <Grid item xs={12} md={6} lg={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Ventas
                            </Typography>
                            <Typography variant="h4">
                                ${dashboardData?.sales?.thisMonth?.toLocaleString() || 0}
                            </Typography>
                            <Typography color={dashboardData?.sales?.growth >= 0 ? 'success.main' : 'error.main'}>
                                {dashboardData?.sales?.growth >= 0 ? '+' : ''}{dashboardData?.sales?.growth}%
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Compras */}
                <Grid item xs={12} md={6} lg={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Compras
                            </Typography>
                            <Typography variant="h4">
                                ${dashboardData?.purchases?.thisMonth?.toLocaleString() || 0}
                            </Typography>
                            <Typography color={dashboardData?.purchases?.reduction >= 0 ? 'success.main' : 'error.main'}>
                                {dashboardData?.purchases?.reduction >= 0 ? '+' : ''}{dashboardData?.purchases?.reduction}%
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Clientes */}
                <Grid item xs={12} md={6} lg={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Clientes Activos
                            </Typography>
                            <Typography variant="h4">
                                {dashboardData?.counts?.customers?.toLocaleString() || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Productos */}
                <Grid item xs={12} md={6} lg={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Productos Activos
                            </Typography>
                            <Typography variant="h4">
                                {dashboardData?.counts?.products?.toLocaleString() || 0}
                            </Typography>
                            <Typography color="warning.main">
                                {dashboardData?.counts?.lowStock} con bajo stock
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Gráfico de tendencias */}
            <Card mb={3}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Tendencias
                    </Typography>
                    <Box height={400}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                                data={dashboardData?.chartData?.salesTrend?.map((value, index) => ({
                                    name: `Día ${index + 1}`,
                                    ventas: value,
                                    compras: dashboardData?.chartData?.purchasesTrend[index]
                                }))}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="ventas" stroke="#8884d8" />
                                <Line type="monotone" dataKey="compras" stroke="#82ca9d" />
                            </LineChart>
                        </ResponsiveContainer>
                    </Box>
                </CardContent>
            </Card>

            {/* Actividades recientes */}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Actividades Recientes
                    </Typography>
                    {dashboardData?.activities?.map((activity, index) => (
                        <Box key={index} mb={2} p={2} bgcolor="background.default" borderRadius={1}>
                            <Typography variant="subtitle1">
                                {activity.icon} {activity.title}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                                {activity.relativeTime}
                            </Typography>
                            {activity.amount && (
                                <Typography variant="body2" color="primary">
                                    ${activity.amount.toLocaleString()}
                                </Typography>
                            )}
                        </Box>
                    ))}
                </CardContent>
            </Card>
        </Box>
    );
};

export default Dashboard; 
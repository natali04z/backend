// Endpoints de la API
const API_URL = "https://backend-yy4o.onrender.com/api";
const API_RESET_PASSWORD = `${API_URL}/auth/reset-password`;

/**
 * Función para obtener el token de la URL
 */
function getTokenFromUrl() {
  const path = window.location.pathname;
  const pathParts = path.split('/');
  const token = pathParts[pathParts.length - 1];
  return token;
}

/**
 * Función para restablecer la contraseña
 */
function resetPassword() {
  const token = getTokenFromUrl();
  const newPassword = document.getElementById('newPassword').value.trim();
  const confirmPassword = document.getElementById('confirmPassword').value.trim();
  
  // Validaciones
  if (!newPassword || !confirmPassword) {
    Swal.fire({
      icon: 'warning',
      title: 'Validación',
      text: 'Todos los campos son obligatorios'
    });
    return;
  }
  
  if (newPassword !== confirmPassword) {
    Swal.fire({
      icon: 'warning',
      title: 'Validación',
      text: 'Las contraseñas no coinciden'
    });
    return;
  }
  
  // Mostrar indicador de carga
  Swal.fire({
    title: 'Procesando solicitud',
    text: 'Actualizando tu contraseña...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  // Envío de solicitud al servidor
  fetch(`${API_RESET_PASSWORD}/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword })
  })
  .then(response => {
    const status = response.status;
    return response.json().then(data => {
      return { status, data };
    });
  })
  .then(({ status, data }) => {
    if (status >= 200 && status < 300) {
      Swal.fire({
        icon: 'success',
        title: 'Contraseña actualizada',
        text: 'Tu contraseña ha sido actualizada correctamente',
        timer: 3000,
        timerProgressBar: true
      }).then(() => {
        // Redirigir al login
        window.location.href = 'index.html';
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: data.message || 'No se pudo actualizar la contraseña. El token puede ser inválido o haber expirado.'
      });
    }
  })
  .catch(error => {
    console.error("Error al restablecer la contraseña:", error);
    Swal.fire({
      icon: 'error',
      title: 'Error de conexión',
      text: 'No se pudo conectar con el servidor. Verifica tu conexión a internet.'
    });
  });
}

// Hacer accesible la función globalmente
window.resetPassword = resetPassword;

// Verificar el token al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  const token = getTokenFromUrl();
  if (!token) {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'No se encontró un token válido en la URL',
      allowOutsideClick: false
    }).then(() => {
      // Redirigir al login
      window.location.href = 'index.html';
    });
  }
});
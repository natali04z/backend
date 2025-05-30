// Endpoints de la API
const API_PROVIDERS = "https://backend-yy4o.onrender.com/api/providers";

// Variables globales para proveedores y paginación
let allProviders = [];
let originalProviders = [];
let currentPage = 1;
const rowsPerPage = 10;

// Función para validar un campo y mostrar error
function validateField(fieldId, errorMessage) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(`${fieldId}-error`);
  
  if (!field.value.trim()) {
    errorElement.textContent = errorMessage || "El campo es obligatorio.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else {
    errorElement.style.display = "none";
    field.classList.remove("input-error");
    return true;
  }
}

// Función para validar número NIT (actualizada para solo dígitos)
function validateNIT(fieldId) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(`${fieldId}-error`);
  
  if (!field.value.trim()) {
    errorElement.textContent = "El NIT es obligatorio.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else if (!/^\d+$/.test(field.value.trim())) {
    errorElement.textContent = "El NIT debe contener únicamente números.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else {
    errorElement.style.display = "none";
    field.classList.remove("input-error");
    return true;
  }
}

// Función para validar teléfono
function validatePhone(fieldId) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(`${fieldId}-error`);
  
  if (!field.value.trim()) {
    errorElement.textContent = "El teléfono es obligatorio.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else if (!/^\d+$/.test(field.value.trim())) {
    errorElement.textContent = "El teléfono debe contener únicamente números.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else if (field.value.trim().length < 10) {
    errorElement.textContent = "El teléfono debe tener al menos 10 números.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else {
    errorElement.style.display = "none";
    field.classList.remove("input-error");
    return true;
  }
}

// Función para validar email
function validateEmail(fieldId) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(`${fieldId}-error`);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!field.value.trim()) {
    errorElement.textContent = "El correo es obligatorio.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else if (!emailRegex.test(field.value.trim())) {
    errorElement.textContent = "El formato del correo electrónico no es válido.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else {
    errorElement.style.display = "none";
    field.classList.remove("input-error");
    return true;
  }
}

// Función para validar nombre empresa
function validateCompany(fieldId) {
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(`${fieldId}-error`);
  
  if (!field.value.trim()) {
    errorElement.textContent = "El nombre de la empresa es obligatorio.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else if (field.value.trim().length < 2 || field.value.trim().length > 100) {
    errorElement.textContent = "El nombre de la empresa debe tener entre 2 y 100 caracteres.";
    errorElement.style.display = "block";
    field.classList.add("input-error");
    return false;
  } else {
    errorElement.style.display = "none";
    field.classList.remove("input-error");
    return true;
  }
}

// Limpiar mensajes de error
function clearValidationErrors(formId) {
  const form = document.getElementById(formId);
  const errorElements = form.querySelectorAll('.error-message');
  const inputElements = form.querySelectorAll('.field-element');
  
  errorElements.forEach(element => {
    element.style.display = "none";
  });
  
  inputElements.forEach(element => {
    element.classList.remove("input-error");
  });
}

// Función para establecer validación de campos numéricos
function setupNumericValidation() {
  const numericInputs = document.querySelectorAll('#contact_phone, #editContactPhone, #nit, #editNit');
  
  numericInputs.forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
        e.preventDefault();
      }
    });
    
    // Limpiar el input si de alguna manera entran caracteres no numéricos
    input.addEventListener('input', function() {
      this.value = this.value.replace(/\D/g, '');
    });
  });
}

// Función para obtener permisos de usuario
function getUserPermissions() {
  try {
    const userInfo = localStorage.getItem('userInfo');
    if (!userInfo) return ['update_providers', 'delete_providers', 'update_status_providers']; // Permisos por defecto
    
    const user = JSON.parse(userInfo);
    return user.permissions || ['update_providers', 'delete_providers', 'update_status_providers'];
  } catch (error) {
    return ['update_providers', 'delete_providers', 'update_status_providers'];
  }
}

// Función para abrir un modal
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "flex";
    
    // Resetear mensajes de error al abrir el modal
    if (modalId === 'registerModal') {
      clearValidationErrors('providerForm');
      document.getElementById("providerForm").reset();
    } else if (modalId === 'editModal') {
      clearValidationErrors('editForm');
    }
  }
}

// Función para cerrar un modal
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.style.display = "none";
  }
}

// Renderizar tabla de proveedores
const renderProvidersTable = (page = 1) => {
  const tbody = document.getElementById("providerTableBody");
  
  if (!tbody) {
    return;
  }
  
  tbody.innerHTML = "";

  if (!allProviders || allProviders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">No hay proveedores disponibles</td></tr>`;
    return;
  }

  const start = (page - 1) * rowsPerPage;
  const end = start + rowsPerPage;
  const providersToShow = allProviders.slice(start, end);

  // Verificar si el usuario tiene permisos para editar
  const userPermissions = getUserPermissions();
  const canEditProviders = userPermissions.includes("update_providers");
  const canUpdateStatus = userPermissions.includes("update_status_providers");

  providersToShow.forEach(provider => {
    tbody.innerHTML += `
      <tr data-id="${provider._id}">
        <td>${provider.id || ''}</td>
        <td>${provider.nit || ''}</td>
        <td>${provider.company || ''}</td>
        <td>${provider.name || ''}</td>
        <td>${provider.contact_phone || ''}</td>
        <td>${provider.email || ''}</td>
        <td>
          <label class="switch">
            <input type="checkbox" ${provider.status === "active" ? "checked" : ""} 
              onclick="updateProviderStatus('${provider._id}', this.checked ? 'active' : 'inactive')" 
              ${canUpdateStatus ? '' : 'disabled'}>
            <span class="slider round"></span>
          </label>
        </td>
        <td>
          <div class="action-buttons">
            <button onclick="fillEditForm('${provider._id}')" class="icon-button edit-button" title="Editar" ${canEditProviders ? '' : 'disabled'}>
              <i class="material-icons">edit</i>
            </button>
            <button onclick="deleteProvider('${provider._id}')" class="icon-button delete-button" title="Eliminar" ${userPermissions.includes("delete_providers") ? '' : 'disabled'}>
              <i class="material-icons">delete</i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  renderPaginationControls();
};

// Renderizar controles de paginación
const renderPaginationControls = () => {
  if (!allProviders || allProviders.length === 0) {
    return;
  }
  
  const totalPages = Math.ceil(allProviders.length / rowsPerPage);
  const container = document.querySelector(".page-numbers");
  const info = document.querySelector(".pagination .page-info:nth-child(2)");

  if (!container || !info) {
    return;
  }

  container.innerHTML = "";

  // Botón anterior
  const prevBtn = document.createElement("button");
  prevBtn.classList.add("page-nav");
  prevBtn.innerText = "←";
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => changePage(currentPage - 1);
  container.appendChild(prevBtn);

  // Números de página
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("div");
    btn.classList.add("page-number");
    if (i === currentPage) btn.classList.add("active");
    btn.innerText = i;
    btn.onclick = () => changePage(i);
    container.appendChild(btn);
  }

  // Botón siguiente
  const nextBtn = document.createElement("button");
  nextBtn.classList.add("page-nav");
  nextBtn.innerText = "→";
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => changePage(currentPage + 1);
  container.appendChild(nextBtn);

  const startItem = (currentPage - 1) * rowsPerPage + 1;
  const endItem = Math.min(startItem + rowsPerPage - 1, allProviders.length);
  info.innerHTML = `${startItem}-${endItem} de ${allProviders.length}`;
};

// Cambiar de página
const changePage = (page) => {
  currentPage = page;
  renderProvidersTable(currentPage);
};

// Cargar proveedores internamente
const loadProvidersInternal = async () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      showError("Inicie sesión nuevamente.");
      return;
    }
    
    const res = await fetch(API_PROVIDERS, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });
    
    const data = await res.json();
    
    if (res.ok) {
      originalProviders = data || [];
      allProviders = [...originalProviders];
      currentPage = 1;
      renderProvidersTable(currentPage);
    } else {
      showError(data.message || "No se pudo listar los proveedores.");
    }
  } catch (err) {
    showError("Error al listar los proveedores.");
  }
};

// Listar proveedores desde el backend
const listProviders = async () => {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      showError("Inicie sesión nuevamente.");
      return;
    }

    showLoadingIndicator();

    const res = await fetch(API_PROVIDERS, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });
    
    const data = await res.json();

    hideLoadingIndicator();

    if (res.ok) {
      originalProviders = data || [];
      allProviders = [...originalProviders];
      currentPage = 1;
      renderProvidersTable(currentPage);
    } else {
      showError(data.message || "No se pudo listar los proveedores.");
    }
  } catch (err) {
    hideLoadingIndicator();
    showError("Error al listar los proveedores.");
  }
};

// Registrar proveedor
const registerProvider = async () => {
  const token = localStorage.getItem("token");
  if (!token) {
    showError("Inicie sesión nuevamente.");
    return;
  }

  const nitValid = validateNIT("nit");
  const companyValid = validateCompany("company");
  const nameValid = validateField("name", "El nombre del contacto es obligatorio.");
  const phoneValid = validatePhone("contact_phone");
  const emailValid = validateEmail("email");

  if (!nitValid || !companyValid || !nameValid || !phoneValid || !emailValid) {
    return;
  }
  
  const nitElement = document.getElementById("nit");
  const companyElement = document.getElementById("company");
  const nameElement = document.getElementById("name");
  const contactPhoneElement = document.getElementById("contact_phone");
  const emailElement = document.getElementById("email");
  
  if (!nitElement || !companyElement || !nameElement || !contactPhoneElement || !emailElement) {
    showError("No se encontraron los campos del formulario");
    return;
  }
  
  const nit = nitElement.value.trim();
  const company = companyElement.value.trim();
  const name = nameElement.value.trim();
  const contact_phone = contactPhoneElement.value.trim();
  const email = emailElement.value.trim();

  try {
    const res = await fetch(API_PROVIDERS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ 
        nit, 
        company, 
        name, 
        contact_phone, 
        email 
      })
    });
    
    const data = await res.json();
    
    if (res.status === 201 || res.ok) {
      showSuccess('El proveedor ha sido registrado');
      closeModal('registerModal');

      const providerForm = document.getElementById("providerForm");
      if (providerForm) {
        providerForm.reset();
      }
 
      loadProvidersInternal();
    } else {
      showError(data.message || "No se pudo registrar el proveedor.");
    }
  } catch (err) {
    showError("Error al registrar el proveedor.");
  }
};

// Llenar formulario de edición
const fillEditForm = async (id) => {
  const token = localStorage.getItem("token");
  if (!token) {
    showError("Inicie sesión nuevamente.");
    return;
  }

  try {
    const res = await fetch(`${API_PROVIDERS}/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.message || "Error al cargar los datos del proveedor.");
      return;
    }

    const editIdElement = document.getElementById("editId");
    const editNitElement = document.getElementById("editNit");
    const editCompanyElement = document.getElementById("editCompany");
    const editNameElement = document.getElementById("editName");
    const editContactPhoneElement = document.getElementById("editContactPhone");
    const editEmailElement = document.getElementById("editEmail");
    
    if (!editIdElement || !editNitElement || !editCompanyElement || 
        !editNameElement || !editContactPhoneElement || !editEmailElement) {
      showError("No se encontraron los campos del formulario de edición");
      return;
    }

    clearValidationErrors('editForm');

    editIdElement.value = data._id;
    editNitElement.value = data.nit || "";
    editCompanyElement.value = data.company || "";
    editNameElement.value = data.name || "";
    editContactPhoneElement.value = data.contact_phone || "";
    editEmailElement.value = data.email || "";

    openModal("editModal");
  } catch (err) {
    showError("Error al cargar el proveedor.");
  }
};

// Actualizar proveedor
const updateProvider = async () => {
  const token = localStorage.getItem("token");
  if (!token) {
    showError("Inicie sesión nuevamente.");
    return;
  }

  const nitValid = validateNIT("editNit");
  const companyValid = validateCompany("editCompany");
  const nameValid = validateField("editName", "El nombre del contacto es obligatorio.");
  const phoneValid = validatePhone("editContactPhone");
  const emailValid = validateEmail("editEmail");

  if (!nitValid || !companyValid || !nameValid || !phoneValid || !emailValid) {
    return;
  }

  const editIdElement = document.getElementById("editId");
  const editNitElement = document.getElementById("editNit");
  const editCompanyElement = document.getElementById("editCompany");
  const editNameElement = document.getElementById("editName");
  const editContactPhoneElement = document.getElementById("editContactPhone");
  const editEmailElement = document.getElementById("editEmail");
  
  if (!editIdElement || !editNitElement || !editCompanyElement || 
    !editNameElement || !editContactPhoneElement || !editEmailElement) {
  showError("No se encontraron los campos del formulario de edición");
  return;
}

const id = editIdElement.value;
const nit = editNitElement.value.trim();
const company = editCompanyElement.value.trim();
const name = editNameElement.value.trim();
const contact_phone = editContactPhoneElement.value.trim();
const email = editEmailElement.value.trim();

try {
  const res = await fetch(`${API_PROVIDERS}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ 
      nit, 
      company, 
      name, 
      contact_phone, 
      email
    })
  });

  const data = await res.json();

  if (res.ok) {
    showSuccess('El proveedor ha sido actualizado');
    closeModal("editModal");
    
    const editForm = document.getElementById("editForm");
    if (editForm) {
      editForm.reset();
    }

    loadProvidersInternal();
  } else {
    showError(data.message || "No se pudo actualizar el proveedor.");
  }
} catch (err) {
  showError("Error al actualizar el proveedor.");
}
};

// Actualizar status del proveedor
const updateProviderStatus = async (id, status) => {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Inicie sesión nuevamente.");
      return;
    }
    
    const res = await fetch(`${API_PROVIDERS}/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
    
    if (res.ok) {
      showSuccess(`El proveedor ha sido ${status === 'active' ? 'activado' : 'desactivado'}`);
      
      loadProvidersInternal();
    } else {
      const data = await res.json();
      showError(data.message || "No se pudo actualizar el estado del proveedor.");
      loadProvidersInternal();
    }
  } catch (err) {
    showError("Error al actualizar estado del proveedor");
    loadProvidersInternal();
  }
};

// Eliminar proveedor 
const deleteProvider = async (id) => {
const token = localStorage.getItem("token");
if (!token) {
  showError("Inicie sesión nuevamente.");
  return;
}

const confirmed = await showConfirm({
  title: "¿Estás seguro de eliminar este proveedor?",
  text: "Esta acción no se puede deshacer.",
  confirmText: "Eliminar",
  cancelText: "Cancelar"
});

if (!confirmed) return;

try {
  const res = await fetch(`${API_PROVIDERS}/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  
  const data = await res.json();
  
  if (res.ok) {
    showSuccess('El proveedor ha sido eliminado');
    loadProvidersInternal();
  } else {
    showError(data.message || "No se pudo eliminar el proveedor");
  }
} catch (err) {
  showError("Error al eliminar proveedor");
}
};

// Buscar proveedor
const searchProvider = () => {
const searchInput = document.getElementById("searchInput");

if (!searchInput) {
  return;
}

const term = searchInput.value.toLowerCase().trim();

if (!originalProviders) {
  return;
}

allProviders = term
  ? originalProviders.filter(p => 
      (p.name && p.name.toLowerCase().includes(term)) || 
      (p.email && p.email.toLowerCase().includes(term)) ||
      (p.company && p.company.toLowerCase().includes(term)) ||
      (p.nit && p.nit.toLowerCase().includes(term))
    )
  : [...originalProviders];

currentPage = 1;
renderProvidersTable(currentPage);
};

function disableNativeBrowserValidation() {
const providerForm = document.getElementById("providerForm");
if (providerForm) {
  providerForm.setAttribute("novalidate", "");
  const inputs = providerForm.querySelectorAll("input");
  inputs.forEach(input => {
    input.removeAttribute("required");
    input.removeAttribute("pattern");
    input.removeAttribute("minlength");
  });
}

// Desactivar validación del formulario de edición
const editForm = document.getElementById("editForm");
if (editForm) {
  editForm.setAttribute("novalidate", "");

  const inputs = editForm.querySelectorAll("input");
  inputs.forEach(input => {
    input.removeAttribute("required");
    input.removeAttribute("pattern");
    input.removeAttribute("minlength");
  });
}
}

// Eventos al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
disableNativeBrowserValidation();

listProviders();
setupNumericValidation();

// Configurar botones y eventos
const mobileAddButton = document.getElementById("mobileAddButton");
if (mobileAddButton) {
  mobileAddButton.onclick = () => openModal('registerModal');
}

const registerButton = document.getElementById("registerButton");
if (registerButton) {
  registerButton.onclick = registerProvider;
}

const updateButton = document.getElementById("updateButton");
if (updateButton) {
  updateButton.onclick = updateProvider;
}

const searchInput = document.getElementById("searchInput");
if (searchInput) {
  searchInput.addEventListener("keyup", searchProvider);
}

const nit = document.getElementById("nit");
if (nit) {
  nit.addEventListener("blur", () => validateNIT("nit"));
}

const company = document.getElementById("company");
if (company) {
  company.addEventListener("blur", () => validateCompany("company"));
}

const name = document.getElementById("name");
if (name) {
  name.addEventListener("blur", () => validateField("name", "El nombre del contacto es obligatorio."));
}

const contact_phone = document.getElementById("contact_phone");
if (contact_phone) {
  contact_phone.addEventListener("blur", () => validatePhone("contact_phone"));
}

const email = document.getElementById("email");
if (email) {
  email.addEventListener("blur", () => validateEmail("email"));
}

const editNit = document.getElementById("editNit");
if (editNit) {
  editNit.addEventListener("blur", () => validateNIT("editNit"));
}

const editCompany = document.getElementById("editCompany");
if (editCompany) {
  editCompany.addEventListener("blur", () => validateCompany("editCompany"));
}

const editName = document.getElementById("editName");
if (editName) {
  editName.addEventListener("blur", () => validateField("editName", "El nombre del contacto es obligatorio."));
}

const editContactPhone = document.getElementById("editContactPhone");
if (editContactPhone) {
  editContactPhone.addEventListener("blur", () => validatePhone("editContactPhone"));
}

const editEmail = document.getElementById("editEmail");
if (editEmail) {
  editEmail.addEventListener("blur", () => validateEmail("editEmail"));
}
});

// Hacer funciones globales si es necesario
window.fillEditForm = fillEditForm;
window.updateProviderStatus = updateProviderStatus;
window.deleteProvider = deleteProvider;
window.openModal = openModal;
window.closeModal = closeModal;
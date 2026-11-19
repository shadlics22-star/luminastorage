const STORAGE_KEY = 'cd-inventory-v1';
const USERS_KEY = 'lumina-users-v1';
const SESSION_KEY = 'lumina-session-v1';
const SCANS_KEY = 'lumina-scan-history-v1';
const products = loadProducts();
let scanHistory = loadScanHistory();
let users = loadUsers();
let currentUser = null;
let inventoryFilter = '';
const scanForm = document.getElementById('scanForm');
const eanInput = document.getElementById('eanInput');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalBody = document.getElementById('modalBody');
const scanMessage = document.getElementById('scanMessage');
const cameraBackdrop = document.getElementById('cameraBackdrop');
const cameraVideo = document.getElementById('cameraVideo');
const cameraStatus = document.getElementById('cameraStatus');
let pendingEan = '';
let pendingScan = null;
let cameraStream = null;
let barcodeDetector = null;
let cameraActive = false;
let cameraScanPending = false;
let cameraTarget = 'scan';

function loadProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.map(product => ({
      ...product,
      quantity: Number(product.quantity) || 0,
      masters: Array.isArray(product.masters) ? product.masters : [],
      location: product.location || '',
      expirationDate: product.expirationDate || ''
    })) : [];
  } catch {
    return [];
  }
}

function saveProducts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

function loadUsers() {
  try {
    const stored = JSON.parse(localStorage.getItem(USERS_KEY) || 'null');
    if (Array.isArray(stored) && stored.length) return stored;
  } catch { /* Use the initial administrator if saved data is unavailable. */ }
  const initial = [{name: 'Administrador', login: 'admin', password: 'admin', phone: '', email: '', role: 'admin'}];
  localStorage.setItem(USERS_KEY, JSON.stringify(initial));
  return initial;
}

function saveUsers() {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadScanHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCANS_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(scan => scan && scan.login && scan.timestamp) : [];
  } catch {
    return [];
  }
}

function saveScanHistory() {
  localStorage.setItem(SCANS_KEY, JSON.stringify(scanHistory));
}

function registerScan(product, quantity) {
  scanHistory.push({
    login: currentUser.login,
    operatorName: currentUser.name,
    productEan: product.ean,
    productName: product.description,
    client: product.client,
    quantity,
    timestamp: new Date().toISOString()
  });
  saveScanHistory();
}

function isAdmin() {
  return currentUser?.role === 'admin';
}

function enterApp(user) {
  currentUser = user;
  sessionStorage.setItem(SESSION_KEY, user.login);
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('appShell').hidden = false;
  document.getElementById('signedInUser').textContent = user.name;
  document.querySelector('.admin-only').hidden = !isAdmin();
  renderInventory();
  renderDashboard();
  if (!isAdmin() && document.getElementById('gestaoView').hidden === false) showView('dashboard');
}

function showView(name) {
  Object.entries(viewSections).forEach(([key, section]) => { section.hidden = key !== name; });
  document.querySelectorAll('.nav-item[data-view]').forEach(item => item.classList.toggle('active', item.dataset.view === name));
  if (name === 'estoque') renderInventory();
  if (name === 'movimentacao') renderMovement();
  if (name === 'dashboard') renderDashboard();
  if (name === 'gestao' && isAdmin()) renderUsers();
  if (name === 'estatisticas') renderStatistics();
}

function cleanEan(value) {
  return value.trim().replace(/\s+/g, '');
}

function findProductByEan(ean) {
  return products.find(product => product.ean === ean || product.masters.some(master => master.ean === ean));
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

function renderDashboard() {
  const clients = new Set(products.map(product => product.client).filter(Boolean));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setMonth(limit.getMonth() + 3);
  const expiring = products.filter(product => {
    if (!product.expirationDate) return false;
    const [year, month, day] = product.expirationDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date >= today && date <= limit;
  }).length;
  document.getElementById('dashboardUnits').textContent = products.length.toLocaleString('pt-BR');
  document.getElementById('dashboardMasters').textContent = products.reduce((sum, product) => sum + product.masters.length, 0).toLocaleString('pt-BR');
  document.getElementById('dashboardClients').textContent = clients.size.toLocaleString('pt-BR');
  document.getElementById('dashboardExpiring').textContent = expiring.toLocaleString('pt-BR');
}

function renderInventory() {
  const rows = document.getElementById('productRows');
  const visibleProducts = products.filter(product => !inventoryFilter || product.ean === inventoryFilter || product.masters.some(master => master.ean === inventoryFilter));
  document.getElementById('inventoryFilterStatus').textContent = inventoryFilter ? `Filtro EAN: ${inventoryFilter} · ${visibleProducts.length} produto(s) encontrado(s)` : '';
  document.getElementById('inventoryEan').value = inventoryFilter;
  const totalUnits = products.reduce((sum, product) => sum + product.quantity, 0);
  const masterCount = products.reduce((sum, product) => sum + product.masters.length, 0);
  document.getElementById('totalUnits').textContent = totalUnits.toLocaleString('pt-BR');
  document.getElementById('productCount').textContent = products.length.toLocaleString('pt-BR');
  document.getElementById('masterCount').textContent = masterCount.toLocaleString('pt-BR');
  document.getElementById('tableCount').textContent = `${visibleProducts.length} ${visibleProducts.length === 1 ? 'produto' : 'produtos'}`;
  document.getElementById('emptyState').hidden = visibleProducts.length > 0;
  document.getElementById('emptyState').querySelector('strong').textContent = inventoryFilter ? 'Nenhum produto encontrado' : 'Nenhum produto no inventário';
  document.getElementById('emptyState').querySelector('p').textContent = inventoryFilter ? 'Confira o EAN bipado ou limpe o filtro.' : 'Comece bipando um EAN para cadastrar seu primeiro produto.';
  rows.innerHTML = visibleProducts.map(product => `
    <tr class="${product.quantity <= 0 ? 'stock-zero' : ''}">
      <td><span class="product-name">${escapeHtml(product.description)}</span><span class="product-sub">${product.masters.length} ${product.masters.length === 1 ? 'caixa master' : 'caixas master'}</span></td>
      <td><span class="sku-pill">${escapeHtml(product.sku || '—')}</span></td>
      <td><span class="ean-text">${escapeHtml(product.ean)}</span></td>
      <td>${escapeHtml(product.client)}</td>
      <td>${escapeHtml(product.location || 'Não definida')}</td>
      <td>${escapeHtml(formatDate(product.expirationDate) || '—')}</td>
      <td class="quantity-cell">${product.quantity.toLocaleString('pt-BR')} un.</td>
      <td><button type="button" class="remove-unit-button" data-remove-ean="${escapeHtml(product.ean)}" ${product.quantity <= 0 ? 'disabled' : ''} aria-label="Remover uma unidade de ${escapeHtml(product.description)}">−1 un.</button></td>
    </tr>`).join('');
  rows.querySelectorAll('[data-remove-ean]').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => item.ean === button.dataset.removeEan);
    if (!product || product.quantity <= 0) return;
    product.quantity -= 1;
    saveProducts();
    renderInventory();
    renderDashboard();
  }));
  renderMovement();
}

let selectedMovementClient = null;

function renderMovement() {
  const content = document.getElementById('movementContent');
  const clients = [...new Set(products.map(product => product.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (!selectedMovementClient || !clients.includes(selectedMovementClient)) {
    selectedMovementClient = null;
    content.innerHTML = clients.length ? `<p class="view-intro">Selecione um cliente para consultar e atualizar as localizações dos produtos.</p><div class="client-grid">${clients.map(client => `<button type="button" class="client-card" data-client="${escapeHtml(client)}"><span class="client-avatar">${escapeHtml(client.charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(client)}</strong><small>${products.filter(product => product.client === client).length} produtos</small></span><span class="client-arrow">›</span></button>`).join('')}</div>` : '<div class="empty-state"><span class="empty-icon">⇄</span><strong>Nenhum cliente cadastrado</strong><p>Cadastre produtos na sessão Conferência para começar.</p></div>';
    content.querySelectorAll('[data-client]').forEach(button => button.addEventListener('click', () => {
      selectedMovementClient = button.dataset.client;
      renderMovement();
    }));
    return;
  }

  const clientProducts = products.filter(product => product.client === selectedMovementClient);
  content.innerHTML = `<button type="button" class="back-button" id="movementBack">← Todos os clientes</button><p class="view-intro">Atualize a localização do produto. A alteração será salva automaticamente.</p><div class="movement-product-list">${clientProducts.map(product => `<article class="movement-product"><div class="movement-product-info"><strong>${escapeHtml(product.description)}</strong><small>SKU ${escapeHtml(product.sku || '—')} · EAN ${escapeHtml(product.ean)}</small></div><label>Localização<input class="location-input" data-location-ean="${escapeHtml(product.ean)}" type="text" maxlength="80" value="${escapeHtml(product.location || '')}" placeholder="Ex.: Rua A, Prateleira 02"></label></article>`).join('')}</div>`;
  document.getElementById('movementBack').addEventListener('click', () => { selectedMovementClient = null; renderMovement(); });
  content.querySelectorAll('[data-location-ean]').forEach(input => input.addEventListener('change', () => {
    const product = products.find(item => item.ean === input.dataset.locationEan);
    if (!product) return;
    product.location = input.value.trim();
    saveProducts();
    renderInventory();
    selectedMovementClient = product.client;
    renderMovement();
  }));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function showModal({eyebrow, title, description, icon = '＋', content}) {
  document.getElementById('modalEyebrow').textContent = eyebrow;
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDescription').textContent = description;
  document.getElementById('modalIcon').textContent = icon;
  modalBody.innerHTML = content;
  modalBackdrop.classList.remove('hidden');
  const firstInput = modalBody.querySelector('input:not([readonly]), select');
  if (firstInput) setTimeout(() => firstInput.focus(), 40);
}

function closeModal() {
  modalBackdrop.classList.add('hidden');
  pendingEan = '';
  pendingScan = null;
  setTimeout(() => eanInput.focus(), 30);
}

function promptScanDetails(ean) {
  const product = findProductByEan(ean);
  pendingEan = ean;
  showModal({
    eyebrow: 'DADOS DA LEITURA', title: 'Informe endereço e quantidade',
    description: 'Confirme o endereço e a quantidade bipada. Para uma caixa master, informe o número de caixas.',
    icon: '↗',
    content: `<form id="scanDetailsForm">
      <div class="form-group"><label for="scanLocation">Endereço *</label><input id="scanLocation" maxlength="80" value="${escapeHtml(product?.location || '')}" placeholder="Ex.: Rua A, Prateleira 02" required></div>
      <div class="form-group"><label for="scanQuantity">Quantidade bipada *</label><input id="scanQuantity" type="number" min="1" step="1" value="1" required></div>
      <div class="form-group"><label for="scanExpiration">Data de validade</label><input id="scanExpiration" type="date"></div>
      <div class="inline-error" id="scanDetailsError"></div>
      <div class="modal-actions"><button class="primary-button" type="submit">Continuar</button></div>
    </form>`
  });
  document.getElementById('scanDetailsForm').addEventListener('submit', event => {
    event.preventDefault();
    const quantity = Number(document.getElementById('scanQuantity').value);
    const location = document.getElementById('scanLocation').value.trim();
    if (!location) {
      document.getElementById('scanDetailsError').textContent = 'Informe o endereço do produto.';
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      document.getElementById('scanDetailsError').textContent = 'Informe uma quantidade inteira maior que zero.';
      return;
    }
    const expirationDate = document.getElementById('scanExpiration').value;
    pendingScan = {ean, location, quantity, expirationDate};
    const existingProduct = findProductByEan(ean);
    if (existingProduct) {
      const amount = existingProduct.ean === ean
        ? quantity
        : existingProduct.masters.find(master => master.ean === ean).unitsPerCase * quantity;
      existingProduct.location = location;
      if (expirationDate) existingProduct.expirationDate = expirationDate;
      existingProduct.quantity += amount;
      registerScan(existingProduct, amount);
      saveProducts();
      renderInventory();
      renderDashboard();
      closeModal();
      showMessage(existingProduct.ean === ean
        ? `Produto unitário registrado: +${amount} unidade(s) de ${existingProduct.description}.`
        : `Caixa master registrada: +${amount} unidades de ${existingProduct.description}.`);
      return;
    }
    showTypeChoice(ean);
  });
}

function showTypeChoice(ean) {
  pendingEan = ean;
  showModal({
    eyebrow: 'EAN NÃO CADASTRADO', title: 'Que tipo de código é este?',
    description: `O código ${ean} ainda não está no inventário. Identifique o tipo para continuar.`, icon: '?',
    content: `<div class="choice-card" data-choice="unit"><span class="choice-symbol">▥</span><span><strong>Produto unitário</strong><small>Cadastrar SKU, descrição e cliente.</small></span></div>
      <div class="choice-card" data-choice="master"><span class="choice-symbol">▣</span><span><strong>Caixa master</strong><small>Vincular a um produto e informar unidades por caixa.</small></span></div>
      <div class="inline-error" id="choiceError"></div>`
  });
  modalBody.querySelectorAll('[data-choice]').forEach(card => card.addEventListener('click', () => {
    const scannedEan = pendingEan;
    if (card.dataset.choice === 'unit') showUnitForm(scannedEan);
    else showMasterForm(scannedEan);
  }));
}

function showUnitForm(ean) {
  pendingEan = ean;
  showModal({
    eyebrow: 'CADASTRO DE PRODUTO', title: 'Novo produto unitário',
    description: `Preencha os dados para cadastrar o EAN ${ean}. Endereço e quantidade foram informados na etapa anterior.`,
    content: `<form id="unitForm">
      <div class="form-group"><label for="unitEan">EAN unitário</label><input id="unitEan" value="${escapeHtml(ean)}" readonly></div>
      <div class="form-row"><div class="form-group"><label for="sku">SKU</label><input id="sku" maxlength="60" placeholder="Opcional"></div>
      <div class="form-group"><label for="client">Cliente *</label><select id="client" required><option value="" disabled selected>Selecione um cliente</option>${[...new Set(products.map(product => product.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(client => `<option value="${escapeHtml(client)}">${escapeHtml(client)}</option>`).join('')}<option value="__new__">Novo Cliente</option></select><input id="newClient" maxlength="80" placeholder="Digite o nome do cliente" hidden></div></div>
      <div class="form-group"><label for="description">Descrição do produto *</label><input id="description" required maxlength="120" placeholder="Nome ou descrição"></div>
      <div class="inline-error" id="unitError"></div><div class="modal-actions"><button class="primary-button" type="submit">Salvar produto</button></div>
    </form>`
  });
  const clientSelect = document.getElementById('client');
  const newClientInput = document.getElementById('newClient');
  clientSelect.addEventListener('change', () => {
    const isNewClient = clientSelect.value === '__new__';
    newClientInput.hidden = !isNewClient;
    newClientInput.required = isNewClient;
    if (isNewClient) newClientInput.focus();
  });

  document.getElementById('unitForm').addEventListener('submit', event => {
    event.preventDefault();
    if (findProductByEan(ean)) {
      document.getElementById('unitError').textContent = 'Este EAN já está vinculado a um produto ou caixa master.';
      return;
    }
    const selectedClient = clientSelect.value === '__new__' ? newClientInput.value.trim() : clientSelect.value;
    if (!selectedClient) {
      document.getElementById('unitError').textContent = 'Selecione ou informe um cliente.';
      return;
    }
    const initialQuantity = pendingScan?.quantity || 1;
    const initialLocation = pendingScan?.location || '';
    const newProduct = {ean, sku: document.getElementById('sku').value.trim(), description: document.getElementById('description').value.trim(), client: selectedClient, location: initialLocation, expirationDate: pendingScan?.expirationDate || '', quantity: initialQuantity, masters: []};
    products.push(newProduct);
    registerScan(newProduct, initialQuantity);
    saveProducts(); renderInventory(); renderDashboard(); closeModal(); showMessage(`Produto cadastrado e ${initialQuantity} unidade(s) adicionada(s) ao estoque.`);
  });
}

function showMasterForm(masterEan, unitEan = '') {
  pendingEan = masterEan;
  const matched = unitEan ? products.find(product => product.ean === unitEan) : null;
  showModal({
    eyebrow: 'CADASTRO DE CAIXA', title: 'Vincular caixa master',
    description: `Informe o EAN unitário já cadastrado e quantas unidades há na caixa ${masterEan}.`, icon: '▣',
    content: `<form id="masterForm">
      <div class="form-group"><label for="masterEan">EAN da caixa master</label><input id="masterEan" value="${escapeHtml(masterEan)}" readonly></div>
      <div class="form-group"><label for="linkedEan">EAN do produto unitário *</label><div class="ean-entry"><input id="linkedEan" inputmode="numeric" value="${escapeHtml(unitEan)}" placeholder="Bipe ou digite o EAN unitário" required><button type="button" class="secondary-button" id="masterCameraOpen" aria-label="Ler EAN unitário com a câmera">Câmera</button></div></div>
      <div id="linkedProduct" class="link-product" ${matched ? '' : 'hidden'}>${matched ? `<strong>${escapeHtml(matched.description)}</strong>SKU ${escapeHtml(matched.sku)} · ${escapeHtml(matched.client)}` : ''}</div>
      <div class="form-group"><label for="caseQuantity">Unidades por caixa *</label><input id="caseQuantity" type="number" min="1" step="1" required placeholder="Ex.: 12"></div>
      <p class="view-intro">Endereço e quantidade de caixas bipadas foram informados na etapa anterior.</p>
      <div class="inline-error" id="masterError"></div><div class="modal-actions"><button type="button" class="secondary-button" id="cancelMaster">Voltar</button><button class="primary-button" type="submit">Vincular caixa</button></div>
    </form>`
  });
  const linkedInput = document.getElementById('linkedEan');
  const showLinkedProduct = () => {
    const product = products.find(item => item.ean === cleanEan(linkedInput.value));
    const box = document.getElementById('linkedProduct');
    if (!product) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = `<strong>${escapeHtml(product.description)}</strong>SKU ${escapeHtml(product.sku)} · ${escapeHtml(product.client)}`;
  };
  linkedInput.addEventListener('input', showLinkedProduct);
  linkedInput.addEventListener('change', showLinkedProduct);
  linkedInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); showLinkedProduct(); document.getElementById('caseQuantity').focus(); }
  });
  document.getElementById('cancelMaster').addEventListener('click', () => showTypeChoice(masterEan));
  document.getElementById('masterForm').addEventListener('submit', event => {
    event.preventDefault();
    const product = products.find(item => item.ean === cleanEan(linkedInput.value));
    const error = document.getElementById('masterError');
    const quantity = Number(document.getElementById('caseQuantity').value);
    if (!product) { error.textContent = 'EAN unitário não cadastrado. Cadastre o produto antes de vinculá-lo.'; return; }
    if (findProductByEan(masterEan)) { error.textContent = 'Este EAN já está vinculado a um produto ou caixa master.'; return; }
    if (!Number.isSafeInteger(quantity) || quantity < 1) { error.textContent = 'Informe uma quantidade inteira maior que zero.'; return; }
    const scannedCases = pendingScan?.quantity || 1;
    const addedUnits = quantity * scannedCases;
    product.masters.push({ean: masterEan, unitsPerCase: quantity});
    product.location = pendingScan?.location || product.location;
    if (pendingScan?.expirationDate) product.expirationDate = pendingScan.expirationDate;
    product.quantity += addedUnits;
    registerScan(product, addedUnits);
    saveProducts(); renderInventory(); renderDashboard(); closeModal(); showMessage(`Caixa master vinculada: +${addedUnits} unidades de ${product.description}.`);
  });
}

async function openCamera(target = 'scan') {
  cameraTarget = target;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = 'A câmera precisa de uma conexão segura (HTTPS) e de permissão do navegador.';
    cameraStatus.classList.add('error');
    cameraBackdrop.classList.remove('hidden');
    return;
  }
  if (!('BarcodeDetector' in window)) {
    cameraStatus.textContent = 'A leitura por câmera não é compatível com este navegador. Use um leitor conectado ou digite o EAN.';
    cameraStatus.classList.add('error');
    cameraBackdrop.classList.remove('hidden');
    return;
  }

  cameraBackdrop.classList.remove('hidden');
  cameraStatus.classList.remove('error');
  cameraStatus.textContent = 'Solicitando acesso à câmera…';
  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'].filter(format => supported.includes(format));
    if (!formats.length) throw new Error('Este navegador não oferece formatos de código de barras compatíveis.');
    barcodeDetector = new BarcodeDetector({formats});
    cameraStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraActive = true;
    cameraStatus.textContent = 'Mantenha o código de barras visível na câmera.';
    scanCameraFrame();
  } catch (error) {
    stopCamera();
    cameraStatus.textContent = error.name === 'NotAllowedError'
      ? 'Acesso à câmera negado. Permita o uso da câmera nas configurações do navegador.'
      : (error.message || 'Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.');
    cameraStatus.classList.add('error');
  }
}

async function scanCameraFrame() {
  if (!cameraActive) return;
  if (!cameraScanPending && cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    cameraScanPending = true;
    try {
      const detections = await barcodeDetector.detect(cameraVideo);
      const code = detections.find(item => /^\d{8,14}$/.test(item.rawValue));
      if (code) {
        stopCamera();
        cameraBackdrop.classList.add('hidden');
        if (cameraTarget === 'master') {
          const linkedInput = document.getElementById('linkedEan');
          if (linkedInput) {
            linkedInput.value = code.rawValue;
            linkedInput.dispatchEvent(new Event('input', {bubbles: true}));
            linkedInput.focus();
          }
        } else {
          eanInput.value = code.rawValue;
          scanForm.requestSubmit();
        }
        cameraTarget = 'scan';
        return;
      }
    } catch {
      cameraStatus.textContent = 'Não foi possível ler a imagem. Tente enquadrar novamente o código.';
    } finally {
      cameraScanPending = false;
    }
  }
  if (cameraActive) setTimeout(scanCameraFrame, 180);
}

function stopCamera() {
  cameraActive = false;
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
}

function closeCamera() {
  stopCamera();
  cameraBackdrop.classList.add('hidden');
  cameraStatus.classList.remove('error');
  eanInput.focus();
}

function showMessage(message, isError = false) {
  scanMessage.textContent = message;
  scanMessage.classList.toggle('error', isError);
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => { scanMessage.textContent = ''; }, 6000);
}

scanForm.addEventListener('submit', event => {
  event.preventDefault();
  const ean = cleanEan(eanInput.value);
  if (!ean) { showMessage('Leia ou digite um código EAN para continuar.', true); return; }
  eanInput.value = '';
  promptScanDetails(ean);
});

document.getElementById('cameraOpen').addEventListener('click', () => openCamera('scan'));
const viewSections = {
  dashboard: document.getElementById('dashboardView'),
  conferencia: document.getElementById('conferenciaView'),
  movimentacao: document.getElementById('movimentacaoView'),
  estoque: document.getElementById('estoqueView'),
  gestao: document.getElementById('gestaoView'),
  estatisticas: document.getElementById('estatisticasView')
};

document.querySelectorAll('.nav-item[data-view]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  if (link.dataset.view === 'gestao' && !isAdmin()) return;
  showView(link.dataset.view);
  if (window.matchMedia('(max-width: 650px)').matches) document.querySelector('.sidebar').classList.remove('expanded');
}));

document.getElementById('sidebarToggle').addEventListener('click', event => {
  const sidebar = document.querySelector('.sidebar');
  const mobile = window.matchMedia('(max-width: 650px)').matches;
  sidebar.classList.toggle(mobile ? 'expanded' : 'collapsed');
  const expanded = mobile ? sidebar.classList.contains('expanded') : !sidebar.classList.contains('collapsed');
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
  event.currentTarget.setAttribute('aria-label', expanded ? 'Recolher menu' : 'Expandir menu');
});
modalBody.addEventListener('click', event => {
  if (event.target.id === 'masterCameraOpen') openCamera('master');
});
document.getElementById('cameraClose').addEventListener('click', closeCamera);
cameraBackdrop.addEventListener('click', event => { if (event.target === cameraBackdrop) closeCamera(); });
document.getElementById('modalClose').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', event => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !cameraBackdrop.classList.contains('hidden')) closeCamera();
  else if (event.key === 'Escape' && !modalBackdrop.classList.contains('hidden')) closeModal();
});
document.getElementById('inventorySearchForm').addEventListener('submit', event => {
  event.preventDefault();
  inventoryFilter = cleanEan(document.getElementById('inventoryEan').value);
  renderInventory();
});
document.getElementById('clearInventoryFilter').addEventListener('click', () => {
  inventoryFilter = '';
  renderInventory();
  document.getElementById('inventoryEan').focus();
});

document.getElementById('loginForm').addEventListener('submit', event => {
  event.preventDefault();
  const login = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const user = users.find(item => item.login.toLowerCase() === login && item.password === password);
  if (!user) {
    document.getElementById('loginError').textContent = 'Login ou senha incorretos.';
    return;
  }
  document.getElementById('loginError').textContent = '';
  enterApp(user);
});
document.getElementById('logoutButton').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  currentUser = null;
  document.getElementById('appShell').hidden = true;
  document.getElementById('loginScreen').hidden = false;
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginUser').focus();
});

document.getElementById('userForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!isAdmin()) return;
  const login = document.getElementById('newLogin').value.trim();
  const error = document.getElementById('userFormError');
  if (users.some(user => user.login.toLowerCase() === login.toLowerCase())) {
    error.textContent = 'Este login já está sendo utilizado.';
    return;
  }
  users.push({name: document.getElementById('userName').value.trim(), login, password: document.getElementById('newPassword').value, phone: document.getElementById('userPhone').value.trim(), email: document.getElementById('userEmail').value.trim(), role: document.getElementById('userRole').value});
  saveUsers();
  event.currentTarget.reset();
  error.textContent = '';
  renderUsers();
});

document.getElementById('userRows').addEventListener('click', event => {
  const button = event.target.closest('[data-delete-user]');
  if (!button || !isAdmin()) return;
  const login = button.dataset.deleteUser;
  if (login === 'admin' || login === currentUser.login) return;
  users = users.filter(user => user.login !== login);
  saveUsers();
  renderUsers();
});

function renderUsers() {
  const rows = document.getElementById('userRows');
  rows.innerHTML = users.map(user => `<tr><td>${escapeHtml(user.name)}</td><td>${escapeHtml(user.login)}</td><td>${escapeHtml(user.phone || '—')}</td><td>${escapeHtml(user.email || '—')}</td><td>${user.role === 'admin' ? 'Administrador' : 'Operador'}</td><td>${user.login === 'admin' || user.login === currentUser?.login ? '—' : `<button class="remove-unit-button" type="button" data-delete-user="${escapeHtml(user.login)}">Remover</button>`}</td></tr>`).join('');
}

function periodStart(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === '24h') return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period.endsWith('d')) start.setDate(start.getDate() - Number(period.slice(0, -1)));
  else if (period.endsWith('m')) start.setMonth(start.getMonth() - Number(period.slice(0, -1)));
  else if (period.endsWith('y')) start.setFullYear(start.getFullYear() - Number(period.slice(0, -1)));
  return start;
}

function renderStatistics() {
  const operatorGroup = document.getElementById('operatorFilterGroup');
  const operatorSelect = document.getElementById('statisticsOperator');
  let login = currentUser.login;
  if (isAdmin()) {
    operatorGroup.hidden = false;
    const operators = users.filter(user => user.role !== 'admin');
    const previous = operatorSelect.value;
    operatorSelect.innerHTML = '<option value="all">Todos os operadores</option>' + operators.map(user => `<option value="${escapeHtml(user.login)}">${escapeHtml(user.name)} (${escapeHtml(user.login)})</option>`).join('');
    if (operators.some(user => user.login === previous)) operatorSelect.value = previous;
    login = operatorSelect.value;
  } else {
    operatorGroup.hidden = true;
  }
  const start = periodStart(document.getElementById('statisticsPeriod').value);
  const scans = scanHistory.filter(scan => {
    const timestamp = new Date(scan.timestamp);
    return timestamp >= start && timestamp <= new Date() && (isAdmin() ? login === 'all' || scan.login === login : scan.login === currentUser.login);
  });
  const quantity = scans.reduce((sum, scan) => sum + (Number(scan.quantity) || 0), 0);
  document.getElementById('statisticsSummary').innerHTML = `<article class="stat-card"><div class="stat-top"><span>Produtos bipados</span><span class="stat-icon purple">▦</span></div><strong>${quantity.toLocaleString('pt-BR')}</strong><small>Unidades registradas no período</small></article><article class="stat-card"><div class="stat-top"><span>Leituras realizadas</span><span class="stat-icon blue">↗</span></div><strong>${scans.length.toLocaleString('pt-BR')}</strong><small>Bipagens registradas</small></article><article class="stat-card"><div class="stat-top"><span>Clientes atendidos</span><span class="stat-icon orange">♙</span></div><strong>${new Set(scans.map(scan => scan.client).filter(Boolean)).size.toLocaleString('pt-BR')}</strong><small>Clientes distintos</small></article>`;
  const byClient = new Map();
  const byProduct = new Map();
  scans.forEach(scan => {
    const clientKey = scan.client || 'Sem cliente';
    byClient.set(clientKey, (byClient.get(clientKey) || 0) + (Number(scan.quantity) || 0));
    const productKey = scan.productEan;
    const existing = byProduct.get(productKey) || {name: scan.productName || 'Produto', client: scan.client || '—', quantity: 0};
    existing.quantity += Number(scan.quantity) || 0;
    byProduct.set(productKey, existing);
  });
  const listMarkup = entries => entries.length ? `<ul class="statistics-list">${entries.map(([name, value]) => `<li><span><strong>${escapeHtml(name)}</strong>${value.detail ? `<small>${escapeHtml(value.detail)}</small>` : ''}</span><b>${escapeHtml(value.count.toLocaleString('pt-BR'))} un.</b></li>`).join('')}</ul>` : '<p class="statistics-empty">Sem bipagens neste período.</p>';
  const clients = [...byClient.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => [name, {count}]);
  const rankedProducts = [...byProduct.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 10).map(([ean, item]) => [item.name, {count: item.quantity, detail: `${item.client} · EAN ${ean}`}]);
  document.getElementById('statisticsClients').innerHTML = listMarkup(clients);
  document.getElementById('statisticsProducts').innerHTML = listMarkup(rankedProducts);
}

 document.getElementById('statisticsPeriod').addEventListener('change', renderStatistics);
document.getElementById('statisticsOperator').addEventListener('change', renderStatistics);

document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', {weekday:'short', day:'2-digit', month:'short', year:'numeric'}).format(new Date());
const savedLogin = sessionStorage.getItem(SESSION_KEY);
const savedUser = users.find(user => user.login === savedLogin);
if (savedUser) enterApp(savedUser);
else document.getElementById('loginUser').focus();
setTimeout(() => { if (currentUser && !viewSections.conferencia.hidden) eanInput.focus(); }, 100);
import http from 'http';
import crypto from 'crypto';

function apiRequest(options: http.RequestOptions, body?: any): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const reqOptions: http.RequestOptions = {
      hostname: 'localhost',
      port: 3000,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
        ...options.headers
      }
    };

    const req = http.request(reqOptions, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(rawData); } catch { parsed = rawData; }
        resolve({ status: res.statusCode || 0, data: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function fetchHtml(urlPath: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, text: data });
      });
    }).on('error', reject);
  });
}

async function runHomologationSuite() {
  console.log('================================================================');
  console.log('MOVILOG - PROTOCOLO OFICIAL DE HOMOLOGAÇÃO DO MASTER OWNER');
  console.log('================================================================\n');

  // Generate a cryptographically secure credential for the redefinition flow at runtime
  // The value is kept strictly in memory and never logged, printed, or exported.
  const secureMasterCred = `Movi#${crypto.randomBytes(12).toString('hex')}!`;
  const invalidCred = `Wrong#${crypto.randomBytes(8).toString('hex')}!`;
  const masterTargetEmail = 'Alifer.quelicare@gmail.com';

  console.log('--- ETAPA PRÉVIA: Execução do Fluxo Seguro de Redefinição ---');
  const resetRes = await apiRequest({
    path: '/api/auth/reset-password',
    method: 'POST'
  }, {
    email: masterTargetEmail,
    password: secureMasterCred
  });

  if (resetRes.status === 200 && resetRes.data?.user?.role === 'master_owner') {
    console.log('✔ SUCESSO: Redefinição de senha executada pelo fluxo seguro com êxito.');
    console.log(`  ID Preservado: ${resetRes.data.user.id}`);
    console.log(`  E-mail Atualizado: ${resetRes.data.user.email}`);
  } else {
    console.error('✖ FALHA NA REDEFINIÇÃO PRÉVIA:', resetRes.status, resetRes.data);
    process.exit(1);
  }

  let passedTests = 0;
  const totalTests = 10;

  // TESTE 1: Login pelo formulário público com o novo e-mail
  console.log('\n--- TESTE 1: Login pelo Formulário Público (Novo E-mail) ---');
  const loginRes = await apiRequest({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: masterTargetEmail,
    password: secureMasterCred
  });

  let activeMasterToken = '';
  if (loginRes.status === 200 && loginRes.data?.token && loginRes.data?.user?.role === 'master_owner') {
    activeMasterToken = loginRes.data.token;
    console.log('✔ SUCESSO: Login autenticado com sucesso pelo endpoint público.');
    console.log(`  ID Confirmado: ${loginRes.data.user.id}`);
    console.log(`  E-mail: ${loginRes.data.user.email}`);
    console.log(`  Perfil: ${loginRes.data.user.role}`);
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 1:', loginRes.status, loginRes.data);
  }

  // TESTE 2: Autenticação com normalização case-insensitive
  console.log('\n--- TESTE 2: Autenticação com Normalização Case-Insensitive ---');
  const caseLoginRes = await apiRequest({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: masterTargetEmail.toLowerCase(),
    password: secureMasterCred
  });

  if (caseLoginRes.status === 200 && caseLoginRes.data?.token) {
    console.log('✔ SUCESSO: Autenticação validada sem distinção de maiúsculas/minúsculas no e-mail.');
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 2:', caseLoginRes.status, caseLoginRes.data);
  }

  // TESTE 3: Rejeição de senha incorreta (ausência de bypass)
  console.log('\n--- TESTE 3: Rejeição de Senha Incorreta ---');
  const wrongPassRes = await apiRequest({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: masterTargetEmail,
    password: invalidCred
  });

  if (wrongPassRes.status === 401 && wrongPassRes.data?.error === 'Credenciais inválidas') {
    console.log('✔ SUCESSO: Senha incorreta bloqueada com HTTP 401 Credenciais inválidas.');
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 3:', wrongPassRes.status, wrongPassRes.data);
  }

  // TESTE 4: Logout e Invalidação da Sessão
  console.log('\n--- TESTE 4: Logout e Invalidação da Sessão ---');
  const logoutRes = await apiRequest({
    path: '/api/auth/logout',
    method: 'POST',
    headers: { Authorization: `Bearer ${activeMasterToken}` }
  });

  if (logoutRes.status === 200) {
    const meAfterLogout = await apiRequest({
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${activeMasterToken}` }
    });
    if (meAfterLogout.status === 401) {
      console.log('✔ SUCESSO: Sessão encerrada e token revogado (HTTP 401 pós-logout).');
      passedTests++;
    } else {
      console.error('✖ FALHA TESTE 4: Token não foi revogado:', meAfterLogout.status);
    }
  } else {
    console.error('✖ FALHA TESTE 4:', logoutRes.status, logoutRes.data);
  }

  // TESTE 5: Nova Autenticação
  console.log('\n--- TESTE 5: Nova Autenticação com Credencial Válida ---');
  let freshMasterToken = '';
  const reAuthRes = await apiRequest({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: masterTargetEmail,
    password: secureMasterCred
  });

  if (reAuthRes.status === 200 && reAuthRes.data?.token) {
    freshMasterToken = reAuthRes.data.token;
    console.log('✔ SUCESSO: Nova autenticação concluída com novo token emitido.');
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 5:', reAuthRes.status, reAuthRes.data);
  }

  // TESTE 6: Persistência da Sessão
  console.log('\n--- TESTE 6: Persistência da Sessão (/api/auth/me) ---');
  const meRes = await apiRequest({
    path: '/api/auth/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${freshMasterToken}` }
  });

  if (meRes.status === 200 && meRes.data?.user?.id === '312f0489-d5ba-4a34-b493-4ffe7318cf2e') {
    console.log('✔ SUCESSO: Sessão persistida e verificada.');
    console.log(`  Usuário: ${meRes.data.user.name} (${meRes.data.user.email})`);
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 6:', meRes.status, meRes.data);
  }

  // TESTE 7: Acesso ao Painel Master Owner (/api/master/stats)
  console.log('\n--- TESTE 7: Acesso ao Painel Master Owner (/api/master/stats) ---');
  const statsRes = await apiRequest({
    path: '/api/master/stats',
    method: 'GET',
    headers: { Authorization: `Bearer ${freshMasterToken}` }
  });

  const totalComps = statsRes.data?.totalCompanies ?? statsRes.data?.totalEmpresas;
  if (statsRes.status === 200 && totalComps !== undefined) {
    console.log('✔ SUCESSO: Estatísticas consolidadas do Master carregadas:');
    console.log(`  Total de Empresas: ${totalComps}`);
    console.log(`  Total de Usuários: ${statsRes.data.totalUsers}`);
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 7:', statsRes.status, statsRes.data);
  }

  // TESTE 8: Consulta de Todas as Empresas (/api/master/companies)
  console.log('\n--- TESTE 8: Consulta de Todas as Empresas (/api/master/companies) ---');
  const companiesRes = await apiRequest({
    path: '/api/master/companies',
    method: 'GET',
    headers: { Authorization: `Bearer ${freshMasterToken}` }
  });

  const list = companiesRes.data?.companies || (Array.isArray(companiesRes.data) ? companiesRes.data : []);
  if (companiesRes.status === 200 && Array.isArray(list) && list.length === 13) {
    console.log(`✔ SUCESSO: Todas as 13 empresas cadastradas foram listadas com sucesso.`);
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 8:', companiesRes.status, list.length);
  }

  // TESTE 9: Bloqueio de Acesso Administrativo para Usuários Comuns
  console.log('\n--- TESTE 9: Bloqueio de Acesso Administrativo para Usuários Comuns ---');
  const driverLogin = await apiRequest({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: 'motorista.audit.1792826740848@letlog.com.br',
    password: 'SenhaDriver123!'
  });

  if (driverLogin.status === 200 && driverLogin.data?.token) {
    const forbiddenRes = await apiRequest({
      path: '/api/master/companies',
      method: 'GET',
      headers: { Authorization: `Bearer ${driverLogin.data.token}` }
    });
    if (forbiddenRes.status === 403) {
      console.log('✔ SUCESSO: Usuário comum bloqueado com HTTP 403 ao tentar acessar rota master.');
      passedTests++;
    } else {
      console.error('✖ FALHA TESTE 9: Não retornou 403:', forbiddenRes.status);
    }
  } else {
    console.error('✖ FALHA TESTE 9 ao autenticar motorista:', driverLogin.status);
  }

  // TESTE 10: Funcionamento dos Demais Perfis do Sistema
  console.log('\n--- TESTE 10: Funcionamento dos Demais Perfis (Operador e Isolamento) ---');
  const operatorLogin = await apiRequest({
    path: '/api/auth/login',
    method: 'POST'
  }, {
    email: 'operador.audit.1792826740848@letlog.com.br',
    password: 'SenhaOp123!'
  });

  if (operatorLogin.status === 200 && operatorLogin.data?.user?.role === 'operator') {
    console.log(`✔ SUCESSO: Perfil de operador autenticado normalmente (Role: ${operatorLogin.data.user.role}).`);
    passedTests++;
  } else {
    console.error('✖ FALHA TESTE 10:', operatorLogin.status, operatorLogin.data);
  }

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS (${(passedTests/totalTests)*100}%)`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runHomologationSuite().catch(err => {
  console.error('Erro na execução da suíte:', err);
  process.exit(1);
});

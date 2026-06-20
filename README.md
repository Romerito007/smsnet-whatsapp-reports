# Relatórios WhatsApp — SMSNET

Painel para consultar os relatórios do Core Gateway WhatsApp e fazer
cancelamento administrativo de pendências. Login único por env, sem banco.
O token JWT do gateway fica **apenas no servidor** (rotas `/api/...` injetam o
`Authorization: Bearer`); o navegador nunca o vê.

## Funcionalidades

- **Relatório de envios** — `POST /queued-ledger/stats`: saúde, throughput,
  latência, status, classes de erro (com ação sugerida), pendências, mais lentos,
  diagnósticos, recomendações e contrato `smsnet_message`.
- **Histórico por conversa** — `GET /messages/history/{id}/{size}`.
- **Busca de mensagens** — `POST /messages/search` (filtros + JSON avançado).
- **Cancelar pendências** — `POST /queued-ledger/cancel`, com fluxo seguro
  dry-run → executar (confirmação) → conferir.

Multi-instância: você escolhe o host:porta (cada instância do gateway) num
seletor, ou digita um endpoint custom. O mesmo token vale para todas (ou um
token por instância, se quiser).

## Variáveis de ambiente

| Variável | Para que serve |
| --- | --- |
| `PANEL_USERNAME` | Usuário do login |
| `PANEL_PASSWORD` | Senha do login |
| `SESSION_SECRET` | Segredo que assina o cookie de sessão (string longa e aleatória) |
| `GATEWAY_TOKEN` | Token JWT do gateway (o `$TOKEN` dos seus curls) |
| `GATEWAY_BASE_PATH` | Prefixo das rotas. Default: `/api/v1/whatsapp` |
| `GATEWAY_INSTANCES` | Lista de instâncias do seletor (JSON ou formato simples) |
| `GATEWAY_ALLOWED_HOST_SUFFIXES` | Sufixos de host liberados para endpoint custom. Default: `smsnet.com.br` |
| `GATEWAY_BASE_URL` | (opcional) instância única de fallback |

Gere o `SESSION_SECRET` com: `openssl rand -base64 48`.

### GATEWAY_INSTANCES

JSON (recomendado):

```
[{"label":"SP2 :10017 — cons 2202","baseUrl":"http://whatsapp-2-sp.smsnet.com.br:10017"},
 {"label":"SP2 :10005 — cons 2681","baseUrl":"http://whatsapp-2-sp.smsnet.com.br:10005"}]
```

Ou formato simples (separado por `;`): `label = url ; label2 = url2`.
Para token por instância, adicione `"token":"..."` no objeto JSON da instância.

> Os endpoints usam `http://` nos seus exemplos. Se algum atender só HTTPS,
> use `https://` no `baseUrl` daquela instância.

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencha os valores
npm run dev
```

## Deploy na Vercel

1. Suba para um repositório Git.
2. Vercel → New Project → importe (Next.js é detectado sozinho).
3. Settings → Environment Variables → cadastre as variáveis acima.
4. Deploy.

Trocar token, usuário/senha ou instâncias = editar a variável na Vercel e
redeploy. Nenhum segredo no código.

## Uso

1. Entre com usuário e senha.
2. Escolha a **instância** (host:porta) no topo.
3. Aba **Relatório**: informe WID/consumer/queue + filtros e sincronize.
4. Aba **Cancelar pendências**: rode a simulação (dry-run), confira o total
   afetado e só então execute. Depois confira pelo relatório.

`Consumer ID` aceita vários separados por vírgula. A allowlist de host protege
o token de vazar para endpoints fora do domínio configurado.

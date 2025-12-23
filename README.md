# Programação de Despesas — Painel do Gestor (Web)

Este painel foi criado para o gestor **programar despesas do dia** de forma rápida e padronizada, registrando tudo na planilha **Despesas** (registro geral) e enviando os dados para:
- **Planilha “Programação de Despesas”** (conferência por coordenação)
- **Aba de Hospedagem (Programação)** quando for **Hotel**
- **LOG_RH** quando houver **Falta / Folga / Atestado** (com notificação ao RH via BotConversa)

---

## ✅ Como acessar
1. Abra o site do painel (GitHub Pages).
2. Informe seu **PIN** de gestor.
3. O sistema libera apenas:
   - sua **Coordenação**
   - e, se houver no cadastro, sua **Supervisão**

> Admin (CPF) pode acessar todas as coordenações.

---

## 🕒 Janela de uso (regra de data)
O painel permite lançar:
- **Hoje**
- **Amanhã** *(somente entre 18:00 e 08:00)*

Se tentar lançar fora da janela, o sistema bloqueia e avisa.

---

## 👥 Lista de colaboradores
O painel carrega os colaboradores ativos da aba do dia (**dd/MM/yyyy**) na planilha de ativos.

### Bloqueio por indisponibilidade (Indisponibilidade)
Se o colaborador tiver registro na planilha **Indisponibilidade** e a **Data de referência** estiver dentro do período:
- **Período inicial ≤ DataRef ≤ Período final**
➡️ Ele aparece como **Bloqueado** (ex.: atestado/ férias).

> Importante: férias futuras não bloqueiam antes de começar.

---

## 🧩 Painéis (Etapas A → E)

### Painel A — Disponibilidade
Aqui você informa se o colaborador irá trabalhar normalmente ou não.

Opções comuns:
- **OK** (segue programação normal)
- **Logística** (ativa regra de deslocamento padrão se estiver vazio)
- **Falta / Folga / Tem atestado / Férias**

✅ Se marcar **Falta / Folga / Tem atestado**:
- O sistema registra no **LOG_RH**
- Envia mensagem direta ao RH (subscriber_id do RH)

Campos enviados ao RH:
- Data
- Colaborador
- Coordenação
- Gestor (do PIN)
- Motivo (Observação do painel)

---

### Painel B — Estadia
Escolha o tipo de estadia:
- Casa
- Fazenda (Pernoite)
- Alojamento
- Hotel

✅ Defaults automáticos:
- **Fazenda**: se Obs vazio → `R$ 30,00 - pernoite`
- **Alojamento**: se Obs vazio → `Alojamento`

✅ Se for **Hotel**
- Registra na planilha de hospedagem (aba **Programação**)
- Campos: **DATA | REGIONAL | CIDADE | FUNCIONÁRIO**
- A cidade é extraída da observação (ex.: `Cidade: Cascavel | ...`)

---

### Painel C — Alimentação
Marque se haverá:
- Café
- Almoço
- Janta

---

### Painel D — Deslocamento
Informe:
- Tipo (ex.: Frota, Carro próprio, etc.)
- Observação (detalhes)

✅ Se no Painel A estiver “Logística” e deslocamento estiver vazio:
- o sistema preenche automaticamente **Frota (motorista)**.

---

### Painel E — Extras
Marque e informe valores:
- Recarga
- Passagem
- Lavagem

📌 Regra importante:
- **Checkbox ligado precisa ter valor > 0** para não “desmarcar” ao re-render.
- Se desmarcar, o valor volta para **0**.

---

## 💾 Salvamento e atualização
- Cada painel salva somente os dados daquela etapa.
- Se você alterar uma programação já salva, o sistema:
  - **atualiza a linha existente**
  - e impede duplicação por chave:
    - `DataReferencia + Colaborador`

---

## 📤 Envio para “Programação de Despesas” (Conferência)
Ao finalizar a **Etapa E**, o sistema sincroniza para a planilha:

**Programação de Despesas**  
ID: `18gNonsMrYRsV6m0HD07yi3m5Zb_JyYimvFC-XrkeAFY`

Abas destino:
- MARIA
- ANDREA
- GRAZI
- RENATA
- TAINA

A aba é escolhida automaticamente conforme a **Coordenação** (mapeamento interno).

---

## 📋 Estrutura esperada nas planilhas

### 1) Despesas_log (registro geral)
A aba “Despesas” precisa conter os cabeçalhos padrão:
- Timestamp
- DataReferencia
- Coordenação
- Colaborador
- Disponibilidade_Status
- Disponibilidade_Obs
- Estadia_Tipo
- Estadia_Obs
- Cafe_Valor
- Almoco_Valor
- Janta_Valor
- Deslocamento_Tipo
- Deslocamento_Obs
- Extras_Recarga_Valor
- Extras_Passagem_Valor
- Extras_Lavagem_Valor
- Extras_Obs

### 2) Programação de Despesas (conferência)
As abas (MARIA/ANDREA/...) precisam ter cabeçalhos:
- DATA | COORDENAÇÃO | SUPERVISÃO | COLABORADOR | DISPONIBILIDADE | ESTADIA | CAFÉ | ALMOÇO | JANTA | DESLOCAMENTO | RECARGA | PASSAGEM | LAVAGEM

### 3) LOG_RH (BotConversa)
Aba: `LOG_RH`  
Planilha: `1yjbkCdsF15GfIdOeYFNJDVxnAGZC5rk1Djz1cn_v0Oc`

---

## ✅ Dicas rápidas
- Sempre confira a **Data de referência** antes de iniciar.
- Se o colaborador não aparece, verifique:
  1) se ele está na aba de ativos do dia
  2) se não está bloqueado por indisponibilidade no período
- Para Hotel, preencha a observação com:
  - `Cidade: Nome da cidade | ...`

---

## 🧪 Testes recomendados
1. Faça login com PIN.
2. Lance 1 colaborador em cada painel.
3. Finalize Etapa E.
4. Confirme:
   - Linha criada/atualizada em **Despesas**
   - Registro na **Programação de Despesas**
   - Hotel registrado na aba **Programação** (se aplicável)
   - LOG_RH + notificação RH (quando houver falta/folga/atestado)

---

## Suporte
Se algo não gravar/atualizar:
- conferir implantação do Apps Script (/exec)
- conferir CORS do Worker
- validar cabeçalhos das planilhas
- verificar permissões do Apps Script e IDs configurados

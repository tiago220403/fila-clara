# Fila Clara · Etapa 5

Interface web e API local de chamados em JavaScript. Use Node.js 22.13 ou superior.

```powershell
node server.mjs
```

Abra http://127.0.0.1:3000, preencha o formulário e confira se o chamado aparece na fila. Para testar a API diretamente, use outro terminal PowerShell.

```powershell
$dados = @{
  titulo = 'Pagamento aprovado, pedido pendente'
  descricao = 'Três clientes relataram o mesmo problema desde as 9h.'
} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3000/chamados -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($dados))
Invoke-RestMethod http://127.0.0.1:3000/chamados
```

O POST retorna 201 e cria o chamado como aberto. O GET retorna 200 e lista os mais recentes primeiro. O SQLite cria o arquivo chamados.db ao iniciar. Pare o servidor com Ctrl+C e inicie de novo para conferir que o chamado continua na fila.

A interface usa GET para carregar a fila e POST para salvar o formulário. Na fila, abra **Triar chamado**, escolha categoria e prioridade e salve. O status passa para **Triado** e você pode editar a triagem depois. A rota PATCH /chamados/:id/triagem recebe categoria e prioridade em JSON. Bancos das etapas anteriores ganham essas colunas ao iniciar o servidor.

## Sugestão de triagem

Abra **Triar chamado** ou **Editar triagem** e clique em **Sugerir triagem**. A sugestão preenche categoria e prioridade e mostra um resumo. Edite os campos e clique em **Salvar triagem** para registrar sua decisão.

Por padrão, o modo de demonstração usa regras locais. A rota POST /chamados/:id/sugestao grava a sugestão na tabela sugestoes, vinculada ao chamado. A decisão humana é atualizada na tabela chamados somente ao salvar.

### Usar um modelo local

Com o Ollama em execução e um modelo instalado, configure o nome exato que aparece em ollama list e reinicie o Fila Clara no mesmo PowerShell.

~~~powershell
$env:FILA_CLARA_MODELO = 'nome-do-modelo-instalado'
node server.mjs
~~~

O backend usa a API local do Ollama e valida categoria, prioridade e resumo. Se o modelo falhar, o formulário permite continuar a triagem manualmente. Para voltar ao modo de demonstração, remova a variável com Remove-Item Env:FILA_CLARA_MODELO e reinicie.

[Documentação da API de chat do Ollama](https://docs.ollama.com/api/chat)

## Avaliação das sugestões

O [conjunto de avaliação](casos-avaliacao.json) contém 15 chamados fictícios com categoria e prioridade definidas manualmente. O gabarito usa **Alta** para impacto amplo ou bloqueio grave, **Média** para impacto parcial e **Baixa** para dúvidas ou inconvenientes menores.

Execute na pasta do projeto. O script chama a mesma função usada pela interface, sem iniciar o servidor ou gravar no banco.

~~~powershell
node avaliar.mjs
~~~

Com a variável FILA_CLARA_MODELO configurada, o script avalia o modelo instalado. Sem ela, avalia o modo de demonstração. Cada diferença é exibida como gabarito → sugestão. Uma resposta ausente ou inválida conta como falha de execução e de classificação. O resumo fica fora da pontuação.

### Resultado da demonstração por regras

| Critério | Resultado |
| --- | ---: |
| Categoria correta | 11/15 |
| Prioridade correta | 9/15 |
| Categoria e prioridade corretas no mesmo chamado | 7/15 |
| Falhas de execução | 0/15 |

- **Planilha travou ao abrir.** A menção a pagamento fez a regra escolher **Pagamento**, embora o incidente fosse um erro de exportação.
- **Painel travou no início do turno.** A regra sugeriu **Média**, mas a expedição inteira estava parada. Pelo gabarito, o impacto justifica **Alta**.
- **Dúvidas de baixa prioridade.** Os cinco casos marcados como **Baixa** receberam **Média**. O modo por regras só produz **Média** ou **Alta**.

A amostra é pequena e serve para encontrar padrões de erro. Os resultados acima são do modo por regras. A medição com um modelo Ollama está pendente.

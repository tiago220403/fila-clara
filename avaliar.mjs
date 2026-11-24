import { readFile } from 'node:fs/promises'
import { sugerirTriagem } from './sugestao.mjs'

const casos = JSON.parse(await readFile(new URL('./casos-avaliacao.json', import.meta.url), 'utf8'))
const modelo = process.env.FILA_CLARA_MODELO?.trim() ?? ''
const placar = { categoria: 0, prioridade: 0, ambos: 0, falhas: 0 }
const linhas = []

for (const { id, titulo, descricao, esperado } of casos) {
  try {
    const sugestao = await sugerirTriagem({ titulo, descricao }, modelo)
    const categoriaCorreta = sugestao.categoria === esperado.categoria
    const prioridadeCorreta = sugestao.prioridade === esperado.prioridade
    if (categoriaCorreta) placar.categoria++
    if (prioridadeCorreta) placar.prioridade++
    if (categoriaCorreta && prioridadeCorreta) placar.ambos++
    linhas.push({
      id,
      caso: titulo,
      categoria: categoriaCorreta ? 'OK' : esperado.categoria + ' → ' + sugestao.categoria,
      prioridade: prioridadeCorreta ? 'OK' : esperado.prioridade + ' → ' + sugestao.prioridade
    })
  } catch (erro) {
    placar.falhas++
    linhas.push({ id, caso: titulo, falha: erro.message })
  }
}

console.log(modelo ? 'Modelo Ollama: ' + modelo : 'Demonstração por regras')
console.log('Diferenças na tabela: gabarito → sugestão')
console.table(linhas)
console.log(`Categoria: ${placar.categoria}/${casos.length}`)
console.log(`Prioridade: ${placar.prioridade}/${casos.length}`)
console.log(`Categoria e prioridade: ${placar.ambos}/${casos.length}`)
console.log(`Falhas de execução: ${placar.falhas}/${casos.length}`)
if (placar.falhas) process.exitCode = 1


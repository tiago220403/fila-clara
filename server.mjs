import { categorias, prioridades, sugerirTriagem } from './sugestao.mjs'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.env.FILA_CLARA_DB ?? new URL('./chamados.db', import.meta.url))
db.exec(`
  CREATE TABLE IF NOT EXISTS chamados (
    id INTEGER PRIMARY KEY,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto',
    criadoEm TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE IF NOT EXISTS sugestoes (
    id INTEGER PRIMARY KEY,
    chamadoId INTEGER NOT NULL REFERENCES chamados(id),
    categoria TEXT NOT NULL,
    prioridade TEXT NOT NULL,
    resumo TEXT NOT NULL,
    origem TEXT NOT NULL,
    criadoEm TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)


// Bancos da primeira etapa já têm a tabela, mas ainda precisam destas colunas.
db.exec('BEGIN IMMEDIATE')
try {
  const colunas = db.prepare('PRAGMA table_info(chamados)').all()
  for (const nome of ['categoria', 'prioridade']) {
    if (!colunas.some(coluna => coluna.name === nome)) {
      db.exec('ALTER TABLE chamados ADD COLUMN ' + nome + ' TEXT')
    }
  }
  db.exec('COMMIT')
} catch (erro) {
  db.exec('ROLLBACK')
  throw erro
}

const atualizarTriagem = db.prepare(
  "UPDATE chamados SET categoria = ?, prioridade = ?, status = 'triado' WHERE id = ? RETURNING *"
)

const listar = db.prepare('SELECT * FROM chamados ORDER BY id DESC')
const buscar = db.prepare('SELECT * FROM chamados WHERE id = ?')
const inserir = db.prepare('INSERT INTO chamados (titulo, descricao) VALUES (?, ?)')

const registrarSugestao = db.prepare(
  'INSERT INTO sugestoes (chamadoId, categoria, prioridade, resumo, origem) VALUES (?, ?, ?, ?, ?)'
)

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(dados))
}

const pagina = readFileSync(new URL('./index.html', import.meta.url))

const server = createServer(async (req, res) => {
  const caminho = req.url.split('?')[0]
  if (caminho === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(req.method === 'HEAD' ? undefined : pagina)
  }
  const rotaTriagem = /^\/chamados\/([1-9]\d*)\/triagem$/.exec(caminho)
  const rotaSugestao = /^\/chamados\/([1-9]\d*)\/sugestao$/.exec(caminho)
  if (caminho !== '/chamados' && !rotaTriagem && !rotaSugestao) {
    return responder(res, 404, { erro: 'Rota não encontrada.' })
  }

  try {
    if (rotaSugestao) {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        return responder(res, 405, { erro: 'Método não permitido.' })
      }
      const id = Number(rotaSugestao[1])
      const chamado = Number.isSafeInteger(id) ? buscar.get(id) : undefined
      if (!chamado) return responder(res, 404, { erro: 'Chamado não encontrado.' })

      let sugestao
      try {
        sugestao = await sugerirTriagem(chamado)
      } catch {
        return responder(res, 503, { erro: 'Sugestão indisponível. Você ainda pode triar manualmente.' })
      }
      registrarSugestao.run(id, sugestao.categoria, sugestao.prioridade, sugestao.resumo, sugestao.origem)
      return responder(res, 200, sugestao)
    }

    if (!rotaTriagem && req.method === 'GET') return responder(res, 200, listar.all())
    const metodo = rotaTriagem ? 'PATCH' : 'POST'
    if (req.method !== metodo) {
      res.setHeader('Allow', rotaTriagem ? 'PATCH' : 'GET, POST')
      return responder(res, 405, { erro: 'Método não permitido.' })
    }

    req.setEncoding('utf8')
    let corpo = ''
    for await (const trecho of req) {
      corpo += trecho
      if (Buffer.byteLength(corpo) > 16_384) {
        return responder(res, 413, { erro: 'Corpo da requisição muito grande.' })
      }
    }

    let dados
    try {
      dados = JSON.parse(corpo)
    } catch {
      return responder(res, 400, { erro: 'Envie um JSON válido.' })
    }

    if (rotaTriagem) {
      const id = Number(rotaTriagem[1])
      if (!Number.isSafeInteger(id)) return responder(res, 404, { erro: 'Chamado não encontrado.' })
      const { categoria, prioridade } = dados ?? {}
      if (!categorias.includes(categoria) || !prioridades.includes(prioridade)) {
        return responder(res, 400, { erro: 'Escolha uma categoria e uma prioridade válidas.' })
      }
      const chamado = atualizarTriagem.get(categoria, prioridade, id)
      return chamado
        ? responder(res, 200, chamado)
        : responder(res, 404, { erro: 'Chamado não encontrado.' })
    }

    const titulo = typeof dados?.titulo === 'string' ? dados.titulo.trim() : ''
    const descricao = typeof dados?.descricao === 'string' ? dados.descricao.trim() : ''
    if (!titulo || titulo.length > 120 || !descricao || descricao.length > 2000) {
      return responder(res, 400, {
        erro: 'Informe um título de até 120 e uma descrição de até 2000 caracteres.'
      })
    }

    const { lastInsertRowid } = inserir.run(titulo, descricao)
    return responder(res, 201, buscar.get(lastInsertRowid))
  } catch (erro) {
    console.error(erro)
    if (!res.destroyed) responder(res, 500, { erro: 'Erro interno.' })
  }
})

const porta = Number(process.env.PORT ?? 3000)
server.listen(porta, '127.0.0.1', () => {
  console.log(`Fila Clara em http://127.0.0.1:${server.address().port}`)
})

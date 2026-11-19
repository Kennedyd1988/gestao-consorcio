"""Gera js/modelo-irp.js a partir do edital "IRP Nº 002/2026" do CIMOP (timbre, rodapé e estilos).
Uso: python3 ferramentas/gerar_modelo_irp.py caminho/IRP.docx"""
import base64, json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
partes, binarios = {}, {}
for n in z.namelist():
    dados = z.read(n)
    if n == 'word/document.xml':
        s = dados.decode('utf-8'); i = s.index('<w:body>') + len('<w:body>'); f = s.index('<w:sectPr')
        doc_inicio, doc_fim = s[:i], s[f:]
    elif n.endswith('.xml') or n.endswith('.rels'):
        partes[n] = dados.decode('utf-8')
    else:
        binarios[n] = base64.b64encode(dados).decode()
saida = '/* Modelo do edital da IRP do CIMOP (timbre, rodapé e estilos do IRP nº 002/2026). Gerado por ferramentas/gerar_modelo_irp.py */\n'
saida += 'window.MODELO_IRP = ' + json.dumps({'partes': partes, 'binarios': binarios, 'docInicio': doc_inicio, 'docFim': doc_fim}, ensure_ascii=False) + ';\n'
open('js/modelo-irp.js', 'w').write(saida)
print('ok', len(saida))

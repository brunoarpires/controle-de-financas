# Gera dados de exemplo: extrato CSV e um cupom NFC-e (imagem) para testar o app.
import random, qrcode
from PIL import Image, ImageDraw, ImageFont, ImageFilter
random.seed(4)
linhas = ['Data;Descrição;Valor']
desp = [('Supermercado Dia', 180, 420), ('Uber *Viagem', 15, 45), ('Posto Ipiranga', 150, 250), ('Drogaria São Paulo', 30, 120), ('iFood *Restaurante', 35, 90), ('Netflix.com', 55.9, 55.9), ('Enel Energia', 160, 230), ('Sabesp', 80, 110), ('Cinema Cinemark', 40, 80), ('Amazon Marketplace', 60, 300)]
for m in range(5, 11):
    linhas.append(f'05/{m:02d}/2026;Salário Empresa XYZ;"6.500,00"'.replace('"', ''))
    linhas.append(f'10/{m:02d}/2026;Aluguel apartamento;-1.850,00')
    for _ in range(14):
        d, a, b = random.choice(desp); v = round(random.uniform(a, b), 2)
        linhas.append(f'{random.randint(1,28):02d}/{m:02d}/2026;{d};-{v:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.'))
open('exemplos/extrato-exemplo.csv', 'w', encoding='utf-8').write('\n'.join(linhas) + '\n')

def dv(ch):
    s, p = 0, 2
    for c in reversed(ch): s += int(c) * p; p = 2 if p == 9 else p + 1
    r = s % 11; return '0' if r < 2 else str(11 - r)
base = '35' + '2610' + '11222333000181' + '65' + '001' + '000012345' + '1' + '00012345'
chave = base + dv(base)
url = f'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p={chave}|2|1|1|ABCDEF0123456789ABCDEF0123456789ABCDEF01'
W = 620; img = Image.new('RGB', (W, 1500), 'white'); d = ImageDraw.Draw(img)
F = lambda s, b=False: ImageFont.truetype(f'/usr/share/fonts/truetype/dejavu/DejaVuSansMono{"-Bold" if b else ""}.ttf', s)
y = 30
def t(s, f=F(20), c=False):
    global y
    x = (W - d.textlength(s, font=f)) / 2 if c else 30
    d.text((x, y), s, font=f, fill='black'); y += f.size + 10
t('SUPERMERCADO EXEMPLO LTDA', F(20, True), True)
t('CNPJ: 11.222.333/0001-81', F(20), True)
t('AV. EXEMPLO, 100 - CENTRO - SAO PAULO/SP', F(18), True)
t('-' * 46, F(18))
t('Documento Auxiliar da Nota Fiscal', F(18), True); t('de Consumidor Eletronica', F(18), True)
t('-' * 46, F(18))
itens = [('ARROZ TIPO 1 5KG', 27.90), ('FEIJAO CARIOCA 1KG', 8.99), ('LEITE INTEGRAL 1L', 4.99), ('CAFE TORRADO 500G', 18.49), ('BANANA PRATA KG', 7.36), ('SABAO EM PO 1KG', 19.90)]
for i, (n, v) in enumerate(itens, 1):
    t(f'{i:03d} {n:<28} {v:>8.2f}'.replace('.', ','), F(19))
tot = sum(v for _, v in itens)
t('-' * 46, F(18))
t(f'QTD. TOTAL DE ITENS {len(itens):>22}', F(19))
t(f'VALOR TOTAL R$ {tot:>27.2f}'.replace('.', ','), F(21, True))
t(f'Cartao de Debito {tot:>25.2f}'.replace('.', ','), F(19))
t('-' * 46, F(18))
t('NFC-e n 000012345 Serie 001', F(18), True)
t('Emissao: 20/10/2026 18:42:10', F(18), True)
t('Consulte pela Chave de Acesso em', F(16), True)
t(' '.join(chave[i:i+4] for i in range(0, 44, 4)), F(16), True)
# versão sem QR (caminho de OCR) e com QR
sem_qr_img = img.crop((0, 0, W, y + 20))
q = qrcode.make(url, box_size=5, border=2).convert('RGB'); img.paste(q, ((W - q.width)//2, y + 10)); y += q.height + 30
img = img.crop((0, 0, W, y))

def como_foto(base):
    foto = Image.new('RGB', (base.width + 160, base.height + 160), (120, 110, 100)); foto.paste(base, (80, 80))
    return foto.rotate(1.5, expand=True, fillcolor=(120, 110, 100)).filter(ImageFilter.GaussianBlur(0.6))

como_foto(img).save('exemplos/nota-exemplo.jpg', quality=85)
como_foto(sem_qr_img).save('exemplos/nota-sem-qrcode.jpg', quality=85)
print(chave, round(tot, 2))

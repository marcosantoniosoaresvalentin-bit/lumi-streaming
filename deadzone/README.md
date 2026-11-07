# Deadzone 3D — versão realista

Battle royale em HTML (Three.js). Esta pasta tem o código-fonte e o jogo pronto.

## Jogar
Abra **`Deadzone.html`** no navegador (Chrome no celular ou PC). É um arquivo único:
tudo (3D, modelos, texturas) está dentro dele, então funciona offline e dá para
colocar direto dentro do APK. Só o modo online precisa de internet.

## O que mudou em relação ao HTML original
- **Personagens realistas**: soldado 3D com esqueleto (skinned mesh, ~11 mil triângulos,
  textura de armadura). Ele copia em tempo real todas as animações que o jogo já tinha:
  correr, agachar, deitar, mirar, atirar, recarregar, paraquedas, queda livre, morte.
  As mãos usam IK para segurar a arma no lugar certo. Vale para jogador, bots,
  rival online e personagens do lobby. As skins de roupa mudam a cor do soldado.
- **Vegetação realista**: pinheiros com galhos de agulhas, árvores de copa cheia,
  arbustos, pedras com relevo e grama densa ao redor do jogador.
- **Construções**: telhados de telha, casas de tijolo à vista, reboco com textura.
- **Ambiente**: chão de grama com textura real sem repetição visível, lagos com ondas,
  reflexos do céu nos materiais (PBR) e sombras suaves.
- **Desempenho**: personagens longe usam o modelo simples (LOD). Em
  *Configurações → Qualidade gráfica*: **Alta** = tudo ligado; **Média** = sem reflexos
  e sombra mais leve; **Baixa** = sem grama densa e sem sombras.
- Correção: as cores de grama/arbustos instanciados ficavam pretas (buffer de cor vazio).
- **Relevo**: morros e montanhas (mais altas nas bordas do mapa). Cidades, estradas,
  lagos, heliportos e construções continuam planos. Jogador, bots, carros (com inclinação),
  árvores, grama e loot seguem o terreno, e os morros bloqueiam tiro e visão.
- **Construções detalhadas**: rodapé, frisos entre andares, peitoris e vergas nas janelas,
  venezianas coloridas, varandas com grade, ar-condicionado, degrau e toldo na porta,
  calhas e chaminés.
- **Janelas quebráveis**: tiros e explosões estilhaçam o vidro (com cacos caindo e som).
  Pela janela quebrada passam tiros e a linha de visão.
- **Animações com captura de movimento**: parado, andar e correr usam animações reais
  (mocap), misturadas com a pose do jogo; com arma na mão, as pernas usam o mocap e
  o tronco continua mirando.
- **Ilha flutuante**: rocha orgânica com textura em vez de blocos, topo de grama,
  árvore gigante realista, construções com textura de pedra, cachoeiras animadas
  e lago com ondas.

## Editar e gerar de novo
```
src/game.html     código do jogo (HTML/CSS/JS)
src/realism.js    personagens realistas, vegetação, materiais e iluminação
src/vendor/       three.js r128 + GLTFLoader + SkeletonUtils
src/assets/       modelo do soldado (.glb) e texturas
tools/build.py    junta tudo em Deadzone.html
```
Depois de editar: `python3 tools/build.py`

## Créditos dos recursos
- Modelo do soldado: `Soldier.glb` dos exemplos do three.js (personagem Mixamo).
- Texturas de grama, tijolo e ondas da água: exemplos do three.js (licença MIT).
- Folhas, agulhas, casca, pedra, telhas e reboco: geradas por código.

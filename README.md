# AppElectron
App feito em electron para gerenciar uma pequena loja de roupase artigos
voce deve instalar o electron e o sqlite3 no seu projeto e adicionar o npm start ao seu arquivo packae.json


esta linha de codigo aqui let deleteButtons = document.querySelectorAll('.delete-button');
deleteButtons.forEach(button => {
  let newButton = button.cloneNode(true);
  button.parentNode.replaceChild(newButton, button);
}); clona o botao ele que deve esta causando o problema se remover ele funciona o problema que sem ele o codigo fica pedindo 4 veses antes de exclir a venda o pop-up aparece varias veses
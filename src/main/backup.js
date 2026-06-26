const fs = require('fs');
const path = require('path');

// Caminho para o banco de dados SQLite
const dbPath = path.join('C:\\Users\\fabri\\Documents\\GitHub\\AppElectron', 'banco_dados.db');

// Caminho para o pendrive (ajuste conforme necessário)
const pendrivePath = 'E:\\';

// Função para copiar o banco de dados
function backupDatabase() {
    const date = new Date();
    const folderName = `${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}`;
    const backupFolder = path.join(pendrivePath, folderName);

    // Cria a pasta de backup se ela não existir
    if (!fs.existsSync(backupFolder)) {
        fs.mkdirSync(backupFolder);
    }

    // Copia o banco de dados
    fs.copyFileSync(dbPath, path.join(backupFolder, 'seu_banco_de_dados.db'));
    console.log('Backup realizado com sucesso!');
}

module.exports = backupDatabase;

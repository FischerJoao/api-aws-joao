require('dotenv').config();
const express = require('express');
const app = express();
// Multer para upload de arquivos
const multer = require('multer');
//BD
const mongoose = require('mongoose');
//swagger
const swaggerDocs = require('./swagger');
//S3
const AWS = require('aws-sdk');

//Log
const { logInfo, logError } = require('./logger');
const mysql = require('mysql2/promise');
// Adicione antes das rotas
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Configuração do pool MySQL com tratamento de erro
const pool = mysql.createPool({
    host: process.env.CNN_MYSQL_DB_HOST.replace(/"/g, ''),
    user: process.env.CNN_MYSQL_DB_USER,
    password: process.env.CNN_MYSQL_DB_PASSWORD,
    database: process.env.CNN_MYSQL_DB_NAME,
    port: process.env.CNN_MYSQL_DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Testar conexão MySQL na inicialização
async function testMySQLConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL conectado com sucesso');
        connection.release();
    } catch (error) {
        console.error('❌ Erro ao conectar ao MySQL:', error.message);
    }
}

app.use(express.json());

// Configuração do multer para armazenar arquivos em memória
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // Limite de 50MB
    }
});

/**
* @swagger
* tags:
*   - name: CRUD MongoDb
*     description: Operações de CRUD para usuários no MongoDb.
*   - name: Buckets
*     description: Operações de Listar buckets, upload e remoção de arquivo para um bucket S3.
*/

/**
 * @swagger
 * tags:
 *   - name: CRUD MySQL
 *     description: Operações de CRUD para produtos no MySQL.
 */

//#region CRUD MongoDb
// Conexão MongoDB com tratamento de erro melhorado
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    logInfo('MongoDB conectado', null);
    console.log('✅ MongoDB conectado com sucesso');
}).catch(err => {
    logError('Erro ao conectar MongoDB: ' + err, null, err);
    console.error('❌ Erro ao conectar ao MongoDB:', err.message);
});

const UserSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    email: { type: String, required: true }
});

const User = mongoose.model('Usuario', UserSchema);

/**
 * @swagger
 * /mongodb/testar-conexao:
 *   get:
 *     tags:
 *       - CRUD MongoDb
 *     summary: Testa a conexão com o MongoDB
 *     description: Verifica se a aplicação consegue se conectar ao MongoDB.
 *     responses:
 *       200:
 *         description: Conexão bem-sucedida
 *       500:
 *         description: Erro na conexão com o MongoDB
 */
app.get('/mongodb/testar-conexao', async (req, res) => {
    try {
        // Verifica se a conexão já está estabelecida
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(process.env.MONGO_URI, { 
                useNewUrlParser: true, 
                useUnifiedTopology: true 
            });
        }
        
        const user = await User.findOne();
        
        logInfo('Conexão com o MongoDB efetuada com sucesso', req);

        if (user) {
            res.status(200).send('Conexão com o MongoDB bem-sucedida e usuário encontrado!');
        } else {
            res.status(200).send('Conexão com o MongoDB bem-sucedida, mas nenhum usuário encontrado.');
        }
    } catch (error) {
        logError('Erro ao conectar no MongoDb: ' + error, req, error);
        res.status(500).json({ 
            error: 'Erro na conexão com o MongoDB',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /usuarios:
 *   post:
 *     tags:
 *       - CRUD MongoDb
 *     summary: Criar um novo usuário
 *     description: Este endpoint cria um novo usuário no sistema.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Nome do usuário
 *               email:
 *                 type: string
 *                 description: Email do usuário
 *             required:
 *               - nome
 *               - email
 *     responses:
 *       201:
 *         description: Usuário criado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                   description: ID do usuário
 *                 nome:
 *                   type: string
 *                 email:
 *                   type: string
 *       400:
 *         description: Requisição inválida.
 */
app.post('/usuarios', async (req, res) => {
    try {
        const { nome, email } = req.body;
        
        // Validação básica
        if (!nome || !email) {
            return res.status(400).json({ 
                error: 'Nome e email são obrigatórios' 
            });
        }

        const user = new User({ nome, email });
        await user.save();
        
        logInfo('Usuário criado', req);
        res.status(201).json(user);
    } catch (error) {
        logError("Erro ao criar usuário", req, error);
        res.status(500).json({ 
            error: 'Erro ao criar usuário',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /usuarios:
 *   get:
 *     tags:
 *       - CRUD MongoDb
 *     summary: Listar todos os usuários
 *     description: Este endpoint retorna todos os usuários cadastrados no sistema.
 *     responses:
 *       200:
 *         description: Lista de usuários
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   nome:
 *                     type: string
 *                   email:
 *                     type: string
 */
app.get('/usuarios', async (req, res) => {
    try {
        const users = await User.find();
        logInfo('Usuários encontrados', req, users);
        res.status(200).json(users);
    } catch (error) {
        logError("Erro ao buscar usuários", req, error);
        res.status(500).json({ 
            error: 'Erro ao buscar usuários',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /usuarios/{id}:
 *   get:
 *     tags:
 *       - CRUD MongoDb
 *     summary: Obter um usuário específico
 *     description: Este endpoint retorna um usuário baseado no ID fornecido.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID do usuário
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuário encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 nome:
 *                   type: string
 *                 email:
 *                   type: string
 *       404:
 *         description: Usuário não encontrado.
 */
app.get('/usuarios/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        logInfo('Usuário encontrado', req, user);
        res.status(200).json(user);
    } catch (error) {
        logError("Erro ao buscar usuário", req, error);
        res.status(500).json({ 
            error: 'Erro ao buscar usuário',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /usuarios/{id}:
 *   put:
 *     tags:
 *       - CRUD MongoDb
 *     summary: Atualizar um usuário específico
 *     description: Este endpoint atualiza um usuário baseado no ID fornecido.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID do usuário
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Usuário atualizado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 nome:
 *                   type: string
 *                 email:
 *                   type: string
 *       404:
 *         description: Usuário não encontrado.
 */
app.put('/usuarios/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        logInfo('Usuário atualizado', req, user);
        res.status(200).json(user);
    } catch (error) {
        logError("Erro ao atualizar usuário", req, error);
        res.status(500).json({ 
            error: 'Erro ao atualizar usuário',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /usuarios/{id}:
 *   delete:
 *     tags:
 *       - CRUD MongoDb
 *     summary: Remover um usuário específico
 *     description: Este endpoint remove um usuário baseado no ID fornecido.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID do usuário
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuário removido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 nome:
 *                   type: string
 *                 email:
 *                   type: string
 *       404:
 *         description: Usuário não encontrado.
 */
app.delete('/usuarios/:id', async (req, res) => {
    try {
        const result = await User.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        logInfo('Usuário removido', req);
        res.status(200).json({ message: 'Usuário removido com sucesso' });
    } catch (error) {
        logError("Erro ao remover usuário", req, error);
        res.status(500).json({ 
            error: 'Erro ao remover usuário',
            message: error.message 
        });
    }
});
//#endregion

//#region S3
AWS.config.update({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    region: process.env.REGION,
    sessionToken: process.env.SESSION_TOKEN,
});

const s3 = new AWS.S3();

/**
 * @swagger
 * /buckets:
 *   get:
 *     summary: Lista todos os buckets
 *     tags: 
 *       - Buckets
 *     responses:
 *       200:
 *         description: Lista de todos os buckets
 */
app.get('/buckets', async (req, res) => {
    try {
        const data = await s3.listBuckets().promise();
        logInfo('Buckets encontrados', req, data.Buckets);
        res.status(200).json(data.Buckets);
    } catch (error) {
        logError("Erro ao buscar buckets", req, error);
        res.status(500).json({ error: 'Erro ao listar buckets', details: error.message });
    }
});

/**
 * @swagger
 * /buckets/{bucketName}:
 *   get:
 *     summary: Lista os objetos de um bucket
 *     tags: 
 *       - Buckets
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         description: Nome do bucket
 *     responses:
 *       200:
 *         description: Lista dos objetos do bucket
 */
app.get('/buckets/:bucketName', async (req, res) => {
    const { bucketName } = req.params;
    const params = {
        Bucket: bucketName,
    };

    try {
        const data = await s3.listObjectsV2(params).promise();
        logInfo('Objetos encontrados', req, data.Contents);
        res.status(200).json(data.Contents);
    } catch (error) {
        logError("Erro ao buscar objetos", req, error);
        res.status(500).json({ error: 'Erro ao listar objetos do bucket', details: error.message });
    }
});

/**
 * @swagger
 * /buckets/{bucketName}/upload:
 *   post:
 *     summary: Faz o upload de um arquivo para um bucket
 *     tags: 
 *       - Buckets
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         description: Nome do bucket
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo a ser enviado
 *               fileName:
 *                 type: string
 *                 description: Nome personalizado para o arquivo (opcional)
 *     responses:
 *       200:
 *         description: Arquivo enviado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 fileName:
 *                   type: string
 *                 location:
 *                   type: string
 *       400:
 *         description: Nenhum arquivo fornecido
 *       500:
 *         description: Erro interno do servidor
 */
app.post('/buckets/:bucketName/upload', upload.single('file'), async (req, res) => {
    try {
        const { bucketName } = req.params;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo fornecido' });
        }

        // Usar o nome personalizado se fornecido, senão usar o nome original
        const fileName = req.body.fileName || req.file.originalname;
        
        const params = {
            Bucket: bucketName,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        const data = await s3.upload(params).promise();
        
        logInfo('Upload efetuado com sucesso', req, {
            fileName: fileName,
            bucketName: bucketName,
            location: data.Location
        });

        res.status(200).json({
            message: 'Arquivo enviado com sucesso',
            fileName: fileName,
            location: data.Location,
            etag: data.ETag
        });
    } catch (error) {
        logError("Erro ao efetuar upload", req, error);
        res.status(500).json({ 
            error: 'Erro ao fazer upload do arquivo', 
            details: error.message 
        });
    }
});

/**
 * @swagger
 * /buckets/{bucketName}/file/{fileName}:
 *   delete:
 *     summary: Deleta um arquivo específico de um bucket
 *     tags: 
 *       - Buckets
 *     parameters:
 *       - in: path
 *         name: bucketName
 *         required: true
 *         description: Nome do bucket
 *       - in: path
 *         name: fileName
 *         required: true
 *         description: Nome do arquivo a ser deletado
 *     responses:
 *       200:
 *         description: Arquivo deletado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 fileName:
 *                   type: string
 *                 bucketName:
 *                   type: string
 *       404:
 *         description: Arquivo não encontrado
 *       500:
 *         description: Erro interno do servidor
 */
app.delete('/buckets/:bucketName/file/:fileName', async (req, res) => {
    try {
        const { bucketName, fileName } = req.params;
        
        // Primeiro verifica se o objeto existe
        const headParams = {
            Bucket: bucketName,
            Key: fileName
        };

        try {
            await s3.headObject(headParams).promise();
        } catch (headError) {
            if (headError.code === 'NotFound') {
                return res.status(404).json({ 
                    error: 'Arquivo não encontrado',
                    fileName: fileName,
                    bucketName: bucketName
                });
            }
            throw headError;
        }

        // Se chegou até aqui, o objeto existe, então pode deletar
        const deleteParams = {
            Bucket: bucketName,
            Key: fileName
        };

        await s3.deleteObject(deleteParams).promise();
        
        logInfo('Objeto removido com sucesso', req, {
            fileName: fileName,
            bucketName: bucketName
        });

        res.status(200).json({
            message: 'Arquivo deletado com sucesso',
            fileName: fileName,
            bucketName: bucketName
        });
    } catch (error) {
        logError("Erro ao remover objeto", req, error);
        res.status(500).json({ 
            error: 'Erro ao deletar arquivo', 
            details: error.message 
        });
    }
});

//#region CRUD MySQL

/**
 * @swagger
 * /mysql/testar-conexao:
 *   get:
 *     tags:
 *       - CRUD MySQL
 *     summary: Testa a conexão com o MySQL
 *     responses:
 *       200:
 *         description: Conexão bem-sucedida
 *       500:
 *         description: Erro na conexão
 */
app.get('/mysql/testar-conexao', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT 1 as test');
        connection.release();
        
        logInfo('Conexão MySQL testada com sucesso', req);
        res.status(200).json({ 
            message: 'Conexão MySQL bem-sucedida',
            test: rows[0]
        });
    } catch (error) {
        logError('Erro ao testar conexão MySQL', req, error);
        res.status(500).json({ 
            error: 'Erro na conexão MySQL',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /produtos:
 *   get:
 *     tags:
 *       - CRUD MySQL
 *     summary: Lista todos os produtos
 *     responses:
 *       200:
 *         description: Lista de produtos
 */
app.get('/produtos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM produto');
        logInfo('Produtos listados com sucesso', req);
        res.status(200).json(rows);
    } catch (error) {
        logError('Erro ao listar produtos', req, error);
        res.status(500).json({ 
            error: 'Erro ao listar produtos',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /produtos:
 *   post:
 *     tags:
 *       - CRUD MySQL
 *     summary: Cria um novo produto
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - descricao
 *               - preco
 *             properties:
 *               nome:
 *                 type: string
 *               descricao:
 *                 type: string
 *               preco:
 *                 type: number
 *     responses:
 *       201:
 *         description: Produto criado
 */
app.post('/produtos', async (req, res) => {
    const { nome, descricao, preco } = req.body;
    
    try {
        // Validação básica
        if (!nome || !descricao || !preco) {
            return res.status(400).json({ 
                error: 'Nome, descrição e preço são obrigatórios' 
            });
        }

        const [result] = await pool.query(
            'INSERT INTO produto (Nome, Descricao, Preco) VALUES (?, ?, ?)',
            [nome, descricao, preco]
        );
        
        logInfo('Produto criado com sucesso', req);
        res.status(201).json({ 
            id: result.insertId, 
            nome, 
            descricao, 
            preco 
        });
    } catch (error) {
        logError('Erro ao criar produto', req, error);
        res.status(500).json({ 
            error: 'Erro ao criar produto',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /produtos/{id}:
 *   get:
 *     tags:
 *       - CRUD MySQL
 *     summary: Busca um produto pelo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Produto encontrado
 *       404:
 *         description: Produto não encontrado
 */
app.get('/produtos/:id', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM produto WHERE Id = ?', [req.params.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        
        logInfo('Produto encontrado', req);
        res.status(200).json(rows[0]);
    } catch (error) {
        logError('Erro ao buscar produto', req, error);
        res.status(500).json({ 
            error: 'Erro ao buscar produto',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /produtos/{id}:
 *   put:
 *     tags:
 *       - CRUD MySQL
 *     summary: Atualiza um produto pelo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               descricao:
 *                 type: string
 *               preco:
 *                 type: number
 *     responses:
 *       200:
 *         description: Produto atualizado
 *       404:
 *         description: Produto não encontrado
 */
app.put('/produtos/:id', async (req, res) => {
    const { nome, descricao, preco } = req.body;
    
    try {
        const [result] = await pool.query(
            'UPDATE produto SET Nome = ?, Descricao = ?, Preco = ? WHERE Id = ?',
            [nome, descricao, preco, req.params.id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        
        logInfo('Produto atualizado', req);
        res.status(200).json({ 
            id: req.params.id, 
            nome, 
            descricao, 
            preco 
        });
    } catch (error) {
        logError('Erro ao atualizar produto', req, error);
        res.status(500).json({ 
            error: 'Erro ao atualizar produto',
            message: error.message 
        });
    }
});

/**
 * @swagger
 * /produtos/{id}:
 *   delete:
 *     tags:
 *       - CRUD MySQL
 *     summary: Remove um produto pelo ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Produto removido
 *       404:
 *         description: Produto não encontrado
 */
app.delete('/produtos/:id', async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM produto WHERE Id = ?', [req.params.id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Produto não encontrado' });
        }
        
        logInfo('Produto removido', req);
        res.status(200).json({ message: 'Produto removido com sucesso' });
    } catch (error) {
        logError('Erro ao remover produto', req, error);
        res.status(500).json({ 
            error: 'Erro ao remover produto',
            message: error.message 
        });
    }
});

//#endregion

// Inicializar conexões e servidor
async function startServer() {
    try {
        // Testar conexões na inicialização
        await testMySQLConnection();
        
        // Inicializar Swagger
        swaggerDocs(app);
        
        // Iniciar servidor
        app.listen(3000, () => {
            console.log('🚀 Servidor rodando na porta 3000');
            console.log('📚 Documentação Swagger disponível em: http://localhost:3000/api-docs');
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();

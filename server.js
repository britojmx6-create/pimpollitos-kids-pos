const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'data', 'inventario.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Función auxiliar para leer la base de datos JSON
function cargarDatos() {
    if (!fs.existsSync(DB_FILE)) {
        const datosIniciales = {
            "categorias": ["Camisas", "Pantalones", "Vestidos", "Chaquetas", "Calzado", "Accesorios", "Ropa interior y de dormir"],
            "tallas": ["2", "4", "6", "8", "10", "12", "14", "S", "M", "L", "XL"],
            "colores": ["Negro", "Blanco", "Azul", "Gris", "Rojo", "Beige", "Multicolor"],
            "productos": [
                {
                    "id": "PROD-1",
                    "codigo": "1001",
                    "nombre": "Camisa Oxford Slim",
                    "categoria": "Camisas",
                    "talla": "M",
                    "color": "Azul",
                    "precio_compra": 10.0,
                    "precio_venta": 25.0,
                    "stock": 10
                },
                {
                    "id": "PROD-2",
                    "codigo": "1002",
                    "nombre": "Jean Slim Fit Azul",
                    "categoria": "Pantalones",
                    "talla": "32",
                    "color": "Azul",
                    "precio_compra": 15.0,
                    "precio_venta": 35.0,
                    "stock": 8
                }
            ],
            "ventas": []
        };
        guardarDatos(datosIniciales);
        return datosIniciales;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
}

function guardarDatos(datos) {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(datos, null, 4), 'utf8');
}

// Rutas de Vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inventario.html'));
});

app.get('/ventas', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ventas.html'));
});

// API para Metadatos (Categorías, Tallas, Colores)
app.get('/api/metadata', (req, res) => {
    const datos = cargarDatos();
    res.json({
        categorias: datos.categorias || [],
        tallas: datos.tallas || [],
        colores: datos.colores || []
    });
});

// API de Productos (con alias de precio y alerta de stock bajo)
app.get('/api/productos', (req, res) => {
    const datos = cargarDatos();
    const productos = datos.productos.map(p => ({
        ...p,
        precio: p.precio_venta,
        precioVenta: p.precio_venta,
        stock_bajo: p.stock <= 2,
        ganancia_unitaria: parseFloat((p.precio_venta - p.precio_compra).toFixed(2)),
        ganancia_total_potencial: parseFloat(((p.precio_venta - p.precio_compra) * p.stock).toFixed(2))
    }));
    res.json(productos);
});

app.post('/api/productos', (req, res) => {
    const datos = cargarDatos();
    const nuevo = req.body;
    
    // Generación automática de código único si se deja vacío
    const siguienteCodigo = 1000 + datos.productos.length + 1;
    const codigoFinal = (!nuevo.codigo || nuevo.codigo.trim() === '') 
        ? siguienteCodigo.toString() 
        : nuevo.codigo;

    const nuevoProd = {
        id: `PROD-${datos.productos.length + 1}`,
        codigo: codigoFinal,
        nombre: nuevo.nombre,
        categoria: nuevo.categoria,
        talla: nuevo.talla || '',
        color: nuevo.color || '',
        precio_compra: parseFloat(nuevo.precio_compra || 0),
        precio_venta: parseFloat(nuevo.precio_venta || 0),
        stock: parseInt(nuevo.stock || 0)
    };

    datos.productos.push(nuevoProd);
    guardarDatos(datos);
    res.status(201).json({ mensaje: "Producto creado con éxito", producto: nuevoProd });
});

app.put('/api/productos/:id', (req, res) => {
    const id = req.params.id;
    const cambios = req.body;
    const datos = cargarDatos();
    
    let encontrado = false;
    datos.productos = datos.productos.map(p => {
        if (p.id === id) {
            encontrado = true;
            return {
                ...p,
                codigo: cambios.codigo !== undefined ? cambios.codigo : p.codigo,
                nombre: cambios.nombre !== undefined ? cambios.nombre : p.nombre,
                categoria: cambios.categoria !== undefined ? cambios.categoria : p.categoria,
                talla: cambios.talla !== undefined ? cambios.talla : p.talla,
                color: cambios.color !== undefined ? cambios.color : p.color,
                precio_compra: cambios.precio_compra !== undefined ? parseFloat(cambios.precio_compra) : p.precio_compra,
                precio_venta: cambios.precio_venta !== undefined ? parseFloat(cambios.precio_venta) : p.precio_venta,
                stock: cambios.stock !== undefined ? parseInt(cambios.stock) : p.stock
            };
        }
        return p;
    });

    if (encontrado) {
        guardarDatos(datos);
        res.json({ mensaje: "Producto actualizado con éxito" });
    } else {
        res.status(404).json({ error: "Producto no encontrado" });
    }
});

app.delete('/api/productos/:id', (req, res) => {
    const id = req.params.id;
    const datos = cargarDatos();
    const largoInicial = datos.productos.length;
    datos.productos = datos.productos.filter(p => p.id !== id);

    if (datos.productos.length < largoInicial) {
        guardarDatos(datos);
        res.json({ mensaje: "Producto eliminado" });
    } else {
        res.status(404).json({ error: "Producto no encontrado" });
    }
});

// API de Ventas
app.post('/api/ventas', (req, res) => {
    const { items } = req.body;
    const datos = cargarDatos();
    let totalVenta = 0;
    let gananciaVenta = 0;
    const detallesVenta = [];

    for (let item of items) {
        const prod = datos.productos.find(p => p.id === item.id);
        if (!prod) {
            return res.status(400).json({ error: `Producto no encontrado: ${item.id}` });
        }
        if (prod.stock < item.cantidad) {
            return res.status(400).json({ error: `Stock insuficiente para ${prod.nombre}` });
        }
        
        prod.stock -= parseInt(item.cantidad);
        const subtotal = prod.precio_venta * item.cantidad;
        const ganancia = (prod.precio_venta - prod.precio_compra) * item.cantidad;
        
        totalVenta += subtotal;
        gananciaVenta += ganancia;

        detallesVenta.push({
            id: prod.id,
            nombre: prod.nombre,
            cantidad: item.cantidad,
            precio_unitario: prod.precio_venta,
            subtotal: subtotal
        });
    }

    const registroVenta = {
        id: `VENTA-${(datos.ventas || []).length + 1}`,
        total: parseFloat(totalVenta.toFixed(2)),
        ganancia: parseFloat(gananciaVenta.toFixed(2)),
        items: detallesVenta
    };

    if (!datos.ventas) datos.ventas = [];
    datos.ventas.push(registroVenta);
    guardarDatos(datos);

    res.json({ mensaje: "Venta procesada con éxito", venta: registroVenta });
});

app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en http://localhost:${PORT}`);
});
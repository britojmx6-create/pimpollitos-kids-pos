const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_FILE = path.join(__dirname, 'data', 'inventario.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Función robusta para leer y asegurar la estructura completa del JSON
function cargarDatos() {
    const datosPorDefecto = {
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
                "stock": 10,
                "imagen": ""
            }
        ],
        "ventas": [],
        "fiados": []
    };

    if (!fs.existsSync(DB_FILE)) {
        guardarDatos(datosPorDefecto);
        return datosPorDefecto;
    }

    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(data);
        
        return {
            categorias: parsed.categorias || datosPorDefecto.categorias,
            tallas: parsed.tallas || datosPorDefecto.tallas,
            colores: parsed.colores || datosPorDefecto.colores,
            productos: parsed.productos || [],
            ventas: parsed.ventas || [],
            fiados: parsed.fiados || []
        };
    } catch (e) {
        console.error("Error al leer inventario.json, usando valores por defecto:", e);
        return datosPorDefecto;
    }
}

function guardarDatos(datos) {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(datos, null, 4), 'utf8');
}

// Función auxiliar optimizada y robusta para guardar imágenes en Base64
function guardarImagenBase64(base64Str, nombreOriginal) {
    if (!base64Str || !nombreOriginal) return null;
    try {
        let base64Data = base64Str;
        
        // Separar de forma segura el contenido Base64 sin importar el tipo de imagen (JPEG, PNG, etc.)
        if (base64Str.includes('base64,')) {
            base64Data = base64Str.split('base64,')[1];
        }
        
        const buffer = Buffer.from(base64Data.trim(), 'base64');
        const carpetaDestino = path.join(__dirname, 'public', 'img', 'productos');
        
        if (!fs.existsSync(carpetaDestino)) {
            fs.mkdirSync(carpetaDestino, { recursive: true });
        }
        
        const nombreLimpio = nombreOriginal.trim().replace(/\s+/g, '_');
        const nombreArchivo = `${Date.now()}_${nombreLimpio}`;
        
        fs.writeFileSync(path.join(carpetaDestino, nombreArchivo), buffer);
        console.log("¡Imagen guardada con éxito en el servidor:", nombreArchivo);
        return nombreArchivo;
    } catch (e) {
        console.error("Error al guardar la imagen:", e);
        return null;
    }
}

// Rutas de Vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'inventario.html'));
});

app.get('/ventas', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'ventas.html'));
});

app.get('/fiados', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'fiados.html'));
});

// API para Metadatos
app.get('/api/metadata', (req, res) => {
    const datos = cargarDatos();
    res.json({
        categorias: datos.categorias,
        tallas: datos.tallas,
        colores: datos.colores
    });
});

// API de Productos
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
    
    const siguienteCodigo = 1000 + datos.productos.length + 1;
    const codigoFinal = (!nuevo.codigo || nuevo.codigo.trim() === '') 
        ? siguienteCodigo.toString() 
        : nuevo.codigo;

    let imagenFinal = '';
    if (nuevo.imagen_base64 && nuevo.imagen_nombre) {
        const guardada = guardarImagenBase64(nuevo.imagen_base64, nuevo.imagen_nombre);
        if (guardada) imagenFinal = guardada;
    }

    const nuevoProd = {
        id: `PROD-${Date.now()}`,
        codigo: codigoFinal,
        nombre: nuevo.nombre,
        categoria: nuevo.categoria,
        talla: nuevo.talla || '',
        color: nuevo.color || '',
        precio_compra: parseFloat(nuevo.precio_compra || 0),
        precio_venta: parseFloat(nuevo.precio_venta || 0),
        stock: parseInt(nuevo.stock || 0),
        imagen: imagenFinal
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
            let imagenFinal = p.imagen;
            if (cambios.imagen_base64 && cambios.imagen_nombre) {
                const guardada = guardarImagenBase64(cambios.imagen_base64, cambios.imagen_nombre);
                if (guardada) imagenFinal = guardada;
            }

            return {
                ...p,
                codigo: cambios.codigo !== undefined ? cambios.codigo : p.codigo,
                nombre: cambios.nombre !== undefined ? cambios.nombre : p.nombre,
                categoria: cambios.categoria !== undefined ? cambios.categoria : p.categoria,
                talla: cambios.talla !== undefined ? cambios.talla : p.talla,
                color: cambios.color !== undefined ? cambios.color : p.color,
                precio_compra: cambios.precio_compra !== undefined ? parseFloat(cambios.precio_compra) : p.precio_compra,
                precio_venta: cambios.precio_venta !== undefined ? parseFloat(cambios.precio_venta) : p.precio_venta,
                stock: cambios.stock !== undefined ? parseInt(cambios.stock) : p.stock,
                imagen: imagenFinal
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
        id: `VENTA-${Date.now()}`,
        total: parseFloat(totalVenta.toFixed(2)),
        ganancia: parseFloat(gananciaVenta.toFixed(2)),
        items: detallesVenta
    };

    datos.ventas.push(registroVenta);
    guardarDatos(datos);

    res.json({ mensaje: "Venta procesada con éxito", venta: registroVenta });
});

// API de Fiados
app.get('/api/fiados', (req, res) => {
    const datos = cargarDatos();
    res.json(datos.fiados);
});

app.post('/api/fiados', (req, res) => {
    const { cliente, telefono, detalle, total } = req.body;
    const datos = cargarDatos();

    const nuevoFiado = {
        id: `FIADO-${Date.now()}`,
        cliente,
        telefono: telefono || '',
        detalle,
        total: parseFloat(total),
        abonado: 0,
        pendiente: parseFloat(total),
        fecha: new Date().toLocaleDateString(),
        estado: 'Pendiente'
    };

    datos.fiados.push(nuevoFiado);
    guardarDatos(datos);
    res.status(201).json({ success: true, fiado: nuevoFiado });
});

app.put('/api/fiados/:id/abonar', (req, res) => {
    const { montoAbono } = req.body;
    const datos = cargarDatos();
    const fiado = datos.fiados.find(f => f.id === req.params.id);

    if (!fiado) return res.status(404).json({ error: "Registro de fiado no encontrado" });

    const abono = parseFloat(montoAbono);
    if (isNaN(abono) || abono <= 0) {
        return res.status(400).json({ error: "Monto de abono inválido" });
    }

    fiado.abonado += abono;
    fiado.pendiente = fiado.total - fiado.abonado;

    if (fiado.pendiente <= 0) {
        fiado.pendiente = 0;
        fiado.estado = 'Pagado';
    }

    guardarDatos(datos);
    res.json({ success: true, fiado });
});

app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en http://localhost:${PORT}`);
});
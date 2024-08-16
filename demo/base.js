const maptalks = window.maptalks;
// eslint-disable-next-line no-unused-vars
const symbol = {
    markerType: 'ellipse',
    markerFill: 'black',
    markerWidth: 5,
    markerHeight: 5
};

const symbol1 = {
    markerType: 'ellipse',
    markerFill: 'red',
    markerWidth: 5,
    markerHeight: 5
};

function parseGeo(geo) {
    let cloneGeo;
    if (geo instanceof maptalks.Geometry) {
        cloneGeo = geo.copy();
    } else {
        cloneGeo = maptalks.GeoJSON.toGeometry(geo.geometry);
    }
    cloneGeo.setSymbol(symbol1);
    return cloneGeo;
}

function showQueryResult(result) {
    console.log(result);
    resultLayer.clear();
    debugLayer.getGeometries().forEach(g => {
        resultLayer.addGeometry(g.copy());
    });
    result.forEach(item => {
        const { layer, geometries } = item;
        console.log(layer);
        const geos = geometries.map(g => {
            const g1 = parseGeo(g);
            return g1;
        });
        resultLayer.addGeometry(geos);
    });
}

// eslint-disable-next-line prefer-const
let resultLayer, layer, debugLayer, drawTool, map1, map2, query;

// eslint-disable-next-line no-var
var vm = new window.Vue({
    el: '#app',
    data: {
        keywords: '肯德基'
    },
    watch: {

    },
    methods: {
        clear() {
            this.keywords = '';
            resultLayer.clear();
        },
        search() {
            if (!this.keywords) {
                return;
            }
            query.query({
                filter: (geo, layer) => {
                    let properties = geo.getPropties ? geo.getPropties() : geo.properties;
                    properties = properties || {};
                    const name = properties.name;
                    return name && name.includes(this.keywords);
                },
                layers: [layer]
            }).then(showQueryResult);
        }
    },
    mounted: function () {

    }
});

// eslint-disable-next-line prefer-const
map1 = new maptalks.Map('map1', {
    'center': [120.7899505, 31.16928532],
    'zoom': 9.49995108663881,
    'pitch': 0,
    'bearing': 0,
    baseLayer: new maptalks.TileLayer('base', {
        urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
    })
});
// eslint-disable-next-line prefer-const
debugLayer = new maptalks.VectorLayer('debuglayer', {
    zIndex: 10
}).addTo(map1);
query = new maptalks.Query(map1);

// eslint-disable-next-line prefer-const
map2 = new maptalks.Map('map2', {
    'center': [120.7899505, 31.16928532],
    'zoom': 9.49995108663881,
    'pitch': 0,
    'bearing': 0,
    baseLayer: new maptalks.TileLayer('base', {
        urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
    })
});

resultLayer = new maptalks.VectorLayer('layer1').addTo(map2);

function spatialQuery(geometry) {
    query.spatialQuery({
        geometry,
        layers: [layer]
    }).then(showQueryResult).catch(error => {
        console.error(error);
    });
}

// eslint-disable-next-line no-unused-vars
const mapSyncControl = new maptalks.MapSync([map1, map2]);

// eslint-disable-next-line no-unused-vars
function initDrawTool() {
    drawTool = new maptalks.DrawTool({
        mode: 'Polygon',
        once: true
    })
        .addTo(map1)
        .disable();

    drawTool.on('drawend', function (param) {
        console.info(param.geometry);
        debugLayer.addGeometry(param.geometry);
        // resultLayer.addGeometry(param.geometry.copy());
        spatialQuery(param.geometry);

    });

    function clear() {
        debugLayer.clear();
        resultLayer.clear();
    }

    const items = [
        // 'Point',
        // 'LineString',
        'Polygon',
        'Circle',
        'Ellipse',
        'Rectangle',
        // 'FreeHandLineString',
        'FreeHandPolygon'
    ].map(function (value) {
        return {
            item: value,
            click: function () {
                drawTool.setMode(value).enable();
                clear();
            }
        };
    });

    new maptalks.control.Toolbar({
        items: [{
            item: 'Shape',
            children: items
        },
        {
            item: 'Disable',
            click: function () {
                drawTool.disable();
            }
        },
        {
            item: 'Clear',
            click: clear
        }
        ]
    }).addTo(map1);
}

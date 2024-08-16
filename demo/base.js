const maptalks = window.maptalks;
// eslint-disable-next-line no-unused-vars
const symbol = {
    markerType: 'ellipse',
    markerFill: 'green',
    markerWidth: 5,
    markerHeight: 5
};

const symbol1 = {
    markerType: 'ellipse',
    markerFill: 'red',
    markerWidth: 5,
    markerHeight: 5
};

// eslint-disable-next-line no-unused-vars
const symbol2 = {
    polygonFill: 'green'
};
const symbol3 = {
    polygonFill: 'red',
    polygonOpacity: 0.7
};

function parseGeo(geo) {
    let cloneGeo;
    if (geo instanceof maptalks.Geometry) {
        cloneGeo = geo.copy();
    } else {
        cloneGeo = maptalks.GeoJSON.toGeometry(geo.geometry);
        const properties = geo.properties || {};
        cloneGeo.setProperties({ name: properties.name });
    }
    if (cloneGeo instanceof maptalks.Marker) {
        cloneGeo.setSymbol(symbol1);
    } else {
        cloneGeo.setSymbol(symbol3);
    }
    return cloneGeo;
}

function getPropties(geo) {
    let properties = geo.getPropties ? geo.getPropties() : geo.properties;
    properties = properties || {};
    return properties;
}

function simleFilter() {
    query.query({
        filter: (geo, layer) => {
            const properties = getPropties(geo);
            const name = properties.name;
            return name && name.includes(vm.keywords);
        },
        layers: [layer]
    }).then(showQueryResult);
}

function spatialQuery(geometry) {
    query.spatialQuery({
        geometry,
        layers: [layer],
        op: vm.op
    }).then(showQueryResult).catch(error => {
        console.error(error);
    });
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
        vm.queryResult = geos.map(g => {
            const properties = getPropties(g);
            return properties;
        });
    });
}

// eslint-disable-next-line prefer-const
let resultLayer, layer, debugLayer, drawTool, map1, map2, query;

function clearQuery() {
    debugLayer.clear();
    resultLayer.clear();
    vm.queryResult = [];
}

// eslint-disable-next-line no-var
var vm = new window.Vue({
    el: '#app',
    data: {
        keywords: '建设',
        queryResult: [],
        ops: maptalks.Query.OPS.map(op => {
            return {
                value: op,
                label: op
            };
        }),
        op: maptalks.Query.intersects
    },
    watch: {

    },
    methods: {
        clear() {
            // this.keywords = '';
            clearQuery();
        },
        search() {
            if (!this.keywords) {
                return;
            }
            simleFilter();
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
    zIndex: -1
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
                clearQuery();
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
            click: clearQuery
        }
        ]
    }).addTo(map1);
}

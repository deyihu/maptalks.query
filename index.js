
import { Util, MicroTask, Layer, Geometry } from 'maptalks';

let jsts;
let geojsonReader;
// const geojsonWriter = new jsts.io.GeoJSONWriter();
const JSTS_ISNULL = 'jsts namespace is null, please injectJSTS(jsts)';
const FILTER_PAGESIZE = 40000;
const SPATIAL_PAGESIZE = 3000;
const OPS = [];

export function injectJSTS(jstsNameSpace) {
    jsts = jstsNameSpace;
}

// export function getJSTS() {
//     return jsts;
// }

function isJSTSAvailable() {
    if (!jsts) {
        console.error(JSTS_ISNULL);
        return false;
    }
    if (!geojsonReader) {
        geojsonReader = new jsts.io.GeoJSONReader();
    }
    return true;
}

function checkRings(feature) {
    const { geometry } = feature;
    if (!geometry) {
        return;
    }
    const { type, coordinates } = geometry;
    if (!type || type.indexOf('Polygon') === -1) {
        return;
    }
    const checkRing = (ring) => {
        const len = ring.length;
        const first = ring[0], last = ring[len - 1];
        if (!first || !last) {
            return;
        }
        const [x1, y1] = first;
        const [x2, y2] = last;
        if (x1 !== x2 || y1 !== y2) {
            ring.push(first);
        }
    };
    let polygons = coordinates;
    if (type === 'Polygon') {
        polygons = [coordinates];
    }
    for (let i = 0, len = polygons.length; i < len; i++) {
        const polygon = polygons[i];
        for (let j = 0, len1 = polygon.length; j < len1; j++) {
            const ring = polygon[j];
            checkRing(ring);
        }
    }

}

function flatGeos(layer, geos) {
    if (layer.getGeometries) {
        return geos;
    }
    const data = [];
    const tiles = geos;
    let tempMap = new Map();
    // vt
    for (let i = 0, len = tiles.length; i < len; i++) {
        const features = tiles[i].features || [];
        for (let j = 0, len1 = features.length; j < len1; j++) {
            const feature = features[j].feature;
            if (feature) {
                const { id, layer } = feature;
                if (id === 0 || id) {
                    const key = `${layer}_${id}`;
                    if (tempMap.has(key)) {
                        continue;
                    }
                    tempMap.set(key, 1);
                }
                data.push(feature);
            }
        }
        // Util.pushIn(geos, features);
    }
    tempMap.clear();
    tempMap = null;
    return data;
}

export class Query {
    constructor(map, options = {}) {
        this.map = map;
        this.options = Object.assign({}, { log: true }, options);
    }

    _filterLayers(layers) {

        if (!this.map) {
            console.error('not find map');
            return [];
        }
        if (!Array.isArray(layers) && layers && layers instanceof Layer) {
            layers = [layers];
        }
        layers = layers || [];
        if (layers.length === 0) {
            const allLayers = this.map._getLayers() || [];
            allLayers.forEach(layer => {
                layers.push(layer);
                if (layer && layer.getLayers) {
                    const childLayers = layer.getLayers() || [];
                    Util.pushIn(layer, childLayers);
                }
            });
        }
        return layers.filter(layer => {
            return layer && !!(layer.getGeometries || layer.getRenderedFeatures || layer.getRenderedFeaturesAsync);
        });
    }

    _getLayerGeos(layer, callback) {
        let geos = [];
        if (!layer) {
            callback(geos);
            return;
        }
        if (layer.getGeometries) {
            geos = layer.getGeometries();
            callback(flatGeos(layer, geos));
        } else if (layer.getRenderedFeaturesAsync) {
            layer.getRenderedFeaturesAsync().then(result => {
                callback(flatGeos(layer, result));
            }).catch(error => {
                console.error(error);
                callback(geos);
            });
        } else if (layer.getRenderedFeatures) {
            geos = layer.getRenderedFeatures();
            callback(flatGeos(layer, geos));
        } else {
            console.error('current layer type not support:', layer);
            callback(geos);
        }
    }

    _getLayersGeos(layers, callback) {
        const data = [];
        if (!layers || layers.length === 0) {
            callback(data);
            return;
        }
        let idx = 0;
        const load = () => {
            if (idx === layers.length) {
                callback(data);
            } else {
                const layer = layers[idx];
                this._getLayerGeos(layer, geos => {
                    geos.forEach(geo => {
                        data.push({ layer, geo });
                    });
                    idx++;
                    load();
                });
            }
        };
        load();
    }

    _filterGeos(data, filter) {
        return new Promise((resolve, reject) => {
            if (!filter || !Util.isFunction(filter)) {
                resolve(data);
                return;
            }
            const pageSize = FILTER_PAGESIZE;
            const count = Math.ceil(data.length / pageSize);
            let page = 1;
            const result = [];
            const run = () => {
                const startIndex = (page - 1) * pageSize,
                    endIndex = page * pageSize;
                const list = data.slice(startIndex, endIndex);
                for (let i = 0, len = list.length; i < len; i++) {
                    const { geo, layer } = list[i];
                    if (!geo) {
                        continue;
                    }
                    if (filter.call(this, geo, layer)) {
                        result.push(list[i]);
                    }
                }
                page++;
            };
            MicroTask.runTaskAsync({ run, count }).then(() => {
                resolve(result);
            }).catch(error => {
                reject(error);
            });
        });
    }

    _spatialFilterGeos(data, geometry, operation) {
        return new Promise((resolve, reject) => {
            let inputGeom;
            const log = this.options.log;
            try {
                const geoJSON = geometry.toGeoJSON();
                inputGeom = geojsonReader.read(geoJSON).geometry;
            } catch (error) {
                console.error(error);
                reject(new Error('geometry.geoJSON() error', geometry));
                return;
            }
            const result = [];
            if (!inputGeom) {
                resolve(result);
                return;
            }
            if (!inputGeom.isValid()) {
                reject(new Error('input geometry is not valide:', geometry));
                return;
            }
            const pageSize = SPATIAL_PAGESIZE;
            const count = Math.ceil(data.length / pageSize);
            let page = 1;

            const TEMPFEATURE = {
                type: 'Feature',
                geometry: null
            };
            const dirtyData = [];
            const run = () => {
                const startIndex = (page - 1) * pageSize,
                    endIndex = page * pageSize;
                const list = data.slice(startIndex, endIndex);
                for (let i = 0, len = list.length; i < len; i++) {
                    const { geo, layer } = list[i];
                    if (!geo) {
                        continue;
                    }
                    let feature, geom;
                    try {
                        if (geo.toGeoJSON) {
                            feature = geo.toGeoJSON();
                        } else if (geo.geometry) {
                            TEMPFEATURE.geometry = geo.geometry;
                            feature = TEMPFEATURE;
                        }
                        if (!feature) {
                            dirtyData.push(geo);
                            log && console.error('not support geo type:', geo, layer);
                            continue;
                        }
                        if (!feature.geometry || !feature.geometry.type || !feature.geometry.coordinates) {
                            dirtyData.push(geo);
                            continue;
                        }
                    } catch (error) {
                        log && console.error(error);
                        log && console.error('geo to geojson error:', geo, layer);
                    }
                    if (!feature) {
                        continue;
                    }
                    try {
                        checkRings(feature);
                        geom = geojsonReader.read(feature).geometry;
                    } catch (error) {
                        log && console.error(error);
                        log && console.error('geometry to jsts geo error:', geo, layer);
                    }
                    if (!geom) {
                        continue;
                    }
                    try {
                        if (inputGeom[operation] && inputGeom[operation](geom)) {
                            result.push(list[i]);
                        }
                    } catch (error) {
                        log && console.error(error);
                        log && console.error('geo spatial cal:', inputGeom, geom, operation);
                    }
                }
                page++;
            };
            MicroTask.runTaskAsync({ run, count }).then(() => {
                if (dirtyData.length) {
                    console.error('has dirty data:', dirtyData);
                }
                resolve(result);
            }).catch(error => {
                reject(error);
            });
        });
    }

    _formatResult(data) {
        const map = new Map();
        for (let i = 0, len = data.length; i < len; i++) {
            const { layer, geo } = data[i];
            let geos = map.get(layer);
            if (!geos) {
                geos = [];
                map.set(layer, geos);
            }
            geos.push(geo);
        }
        const result = [];
        for (const item of map) {
            const [layer, geos] = item;
            result.push({
                layer,
                geometries: geos
            });
        }
        return result;
    }

    query(options = {}) {
        return new Promise((resolve, reject) => {
            const { filter, layers } = options;
            if (!Util.isFunction(filter)) {
                reject(new Error('filter is not function'));
                return;
            }
            const filterLayers = this._filterLayers(layers);
            this._getLayersGeos(filterLayers, data => {
                this._filterGeos(data, filter).then(filterData => {
                    const result = this._formatResult(filterData);
                    resolve(result);
                }).catch(error => {
                    reject(error);
                });
            });
        });
    }

    spatialQuery(options = {}) {
        return new Promise((resolve, reject) => {
            const { filter, layers, geometry, op } = options;
            if (!geometry || !(geometry instanceof Geometry)) {
                reject(new Error('geometry is not maptalks.Geometry'));
                return;
            }
            let operation = op;
            if (!operation) {
                operation = Query.intersects;
            }
            if (OPS.indexOf(operation) === -1) {
                reject(new Error('not support the op:', operation));
                return;
            }
            const filterLayers = this._filterLayers(layers);
            this._getLayersGeos(filterLayers, data => {
                this._filterGeos(data, filter).then(list => {
                    if (!isJSTSAvailable()) {
                        reject(new Error(JSTS_ISNULL));
                    } else {
                        this._spatialFilterGeos(list, geometry, operation).then(filterData => {
                            const result = this._formatResult(filterData);
                            resolve(result);
                        }).catch(error => {
                            reject(error);
                        });
                    }
                }).catch(error => {
                    reject(error);
                });
            });
        });
    }

    dispose() {
        delete this.map;
        delete this.options;
        return this;
    }

}

Query.contains = 'contains';
Query.crosses = 'crosses';
Query.disjoint = 'disjoint';
Query.equals = 'equals';
Query.intersects = 'intersects';
Query.overlaps = 'overlaps';
Query.within = 'within';

OPS.push(Query.contains, Query.crosses, Query.disjoint, Query.equals, Query.intersects, Query.overlaps, Query.within);
Query.OPS = OPS;

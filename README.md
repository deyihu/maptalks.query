# maptalks.query

[maptalks](https://github.com/maptalks/maptalks.js) layers data query tool
*   Request [maptalks gl](https://www.npmjs.com/package/maptalks-gl) version>0.98.0
* Spatial Query rely on [jsts](https://github.com/bjornharrtell/jsts)

```js
import * as jsts from 'jsts';
import {
    injectJSTS
} from 'maptalks.query';
injectJSTS(jsts);
```

## Features

* support simple data filter(such as keyword filter)
* support spatial query
* support laeyrs:
  + VectorLayer
  + PointLayer
  + LineStringLayer
  + PolygonLayer
  + VectorTileLayer
  + GeoJSONVectorTileLayer
  + ...

## Exmaples

* simple data filter
* simple spatial query
* vt data filter
* vt spatial query
* Spatial query operator
* buffer query 
* multi layers query
* mock map identify

## Install

### NPM

```sh
npm i maptalks-gl
npm i maptalks.query
```

## CDN

```html

```

## API

### `injectJSTS(jsts)`

Inject jsts namespace. If you need space query, this is necessary

```js
import * as jsts from 'jsts';
import {
    injectJSTS
} from 'maptalks.query';

injectJSTS(jsts);
```

### `Query` class

layers query tool Class

#### constructor(map, options)

```js
 new Query(map, options)
```

* `map`: maptalks Map
* `options`:config object
  + `options.log`: Whether to output logs when calculation errors occur

```js
 new Query(map, {
     log: true
 })
```

```js
import {
    Map,
    TileLayer,
    Polygon
} from 'maptalks-gl';
import {
    Query,
    injectJSTS
} from 'maptalk.query';
import * as jsts from 'jsts';

injectJSTS(jsts);

const mapView = {
    'center': [120.54069005, 31.14989446],
    'zoom': 9.49995108663881,
    'pitch': 0,
    'bearing': 0
};
// create map
const map = new Map('map1', {
    ...mapView,
    baseLayer: new TileLayer('base', {
        urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>'
    })
});
//create query instance 
const query = new Query(map, {
    log: true
});
```

#### methods

* `query(options)` simple data filter query. Keyword search, etc, return `Promise`
  + `options.filter`:data filter function
  + `options.layers`: The layer to be queried, if empty, will query all layers on the map

```js
function getPropties(geo) {
    let properties = geo.getPropties ? geo.getPropties() : geo.properties;
    properties = properties || {};
    return properties;
}

query.query({
    filter: (geo, layer) => {
        const properties = getPropties(geo);
        const name = properties.name;
        //mock simple keywords query
        return name && name.includes('hello world');
    },
    layers: [layer, layer1, ...otherlayers]
}).then(result => {
    console.log(result);
    //do some things
}).catch(error => {
    console.error(error);
});
```

* `spatialQuery(options)` Geometric space query . return `Promise`

  + `options.geometry`: Input query geometry, maptalks. Polygon/maptalks. Circle/maptalks.
  Rectangle...
  + `options.filter` data filter function if need
  + `options.layers`: The layer to be queried, if empty, will query all layers on the map 
  + `options.op` Geometric Shape Relationship Query Operation, default value is ` Query.intersects`  
    op support list:

    - Query.contains
    - Query.crosses
    - Query.disjoint
    - Query.equals
    - Query.intersects
    - Query.contains
    - Query.overlaps
    - Query.within

```js
injectJSTS(jsts);

const polygon = new Polygon([...]);
query.spatialQuery({
    geometry: polygon,
    layers: [layer, layer1, ...otherlayers]
    op: Query.intersects
}).then((result) => {
    console.log(result);
    //do some things
}).catch(error => {
    console.error(error);
});
```

* `dispose()`

```js
query.dispose();
```

window.onload = main;

const DEBUG = 1

var divSetNdx = 0;
var divSets = [];
var divContainerElement

var trans = [0, 0];
var zoom = 1
var drag = false

var canvasWidth
var canvasHeight

const programs = {dot: null, tri: null}
var gl, Dmesh, Vmesh
var nodeData

var please_stop = false
var running = false
var interactive = true
var show_delaunay = true
var show_hull = true

const color_themes = {
	vintage: {
		bg: [0.98, 0.95, 0.78],
		nodes: [0.51, 0.65, 0.6],
		delaunay: [0.98, 0.29, 0.2],
		hull: [0., 0., 1.],
		voronoi: [0., 0., 0.]
	},
	dracula: {
		bg: [40/255, 42/255, 54/255],
		nodes: [98/255, 114/255, 164/255],
		delaunay: [255/255, 85/255, 85/255],
		hull: [75/255, 234/255, 115/255],
		voronoi: [248/255, 248/255, 242/255]
	},
	gruvbox_light: {
		bg: [0.98, 0.95, 0.78],
		nodes: [0.49, 0.44, 0.39],
		delaunay: [0.8, 0.14, 0.11],
		hull: [0.6, 0.59, 0.1],
		voronoi: [0.84, 0.6, 0.13]
	},
	gruvbox_dark: {
		bg: [0.16, 0.16, 0.16],
		nodes: [0.49, 0.44, 0.39],
		delaunay: [0.8, 0.14, 0.11],
		hull: [0.6, 0.59, 0.1],
		voronoi: [0.84, 0.6, 0.13]
	},
	nord: {
		bg: [0.18, 0.2, 0.25],
		nodes: [0.3, 0.34, 0.42],
		delaunay: [0.75, 0.38, 0.42],
		hull: [0.64, 0.75, 0.55],
		voronoi: [0.71, 0.56, 0.68]
	}
}

var color_theme = color_themes.vintage

//#region HTML stuff
function open_tab(event, tab_name) {
	// Declare all variables
	var i, tabcontent, tablinks;
	
	// Get all elements with class="tabcontent" and hide them
	tabcontent = document.getElementsByClassName("tabcontent");
	for (i = 0; i < tabcontent.length; i++) {
		document.getElementById(tabcontent[i].id).style.display = "none";
		tabcontent[i].style.display = "none";
	}
	
	// Get all elements with class="tablinks" and remove the class "active"
	tablinks = document.getElementsByClassName("tablinks");
	for (i = 0; i < tablinks.length; i++) {
		tablinks[i].className = tablinks[i].className.replace(" active", "");
	}
	
	// Show the current tab, and add an "active" class to the button that opened the tab
	document.getElementById(tab_name).style.display = "block";
	event.currentTarget.className += " active";
} 
//#endregion

//#region debug
function log(msg) {
	if (DEBUG == 1)
		console.log(msg)
}

function tris_to_ids(ls) {
	let result = []
	for (var el of ls) {
		result.push(el.id)
	}
	return result
}

function edges_to_ids(ls) {
	let result = []
	for (var el of ls) {
		result.push(`${el.orig.id} -> ${el.dest.id}`)
	}
	return result
}
//#endregion

//#region rendering
function create_program_dots() {
	var vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, `
	attribute vec3 position;
	attribute vec3 vColor;
	varying vec4 fColor;
	void main() {
		fColor=vec4(vColor, 1.);
		gl_PointSize = 5.0;
		gl_Position = vec4(position, 1);
	}
	`);
	gl.compileShader(vertexShader);

	// create fragment shader
	var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, `
	precision mediump float;
	varying vec4 fColor;
	void main() {
		gl_FragColor = fColor;
		float r = length(2.0 * gl_PointCoord - 1.0);
		if (r > 1.0) {
			discard;
		}
	}
	`);
	gl.compileShader(fragmentShader);

	var program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	return program;
}

function create_program_tris() {
	var vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, `
	attribute vec3 position;
	attribute vec3 color;
	varying vec4 vColor;
	void main() {
		vColor = vec4(color, 1);
		gl_Position = vec4(position, 1);
	}
	`);
	gl.compileShader(vertexShader);

	// create fragment shader
	var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, `
	precision mediump float;
	varying vec4 vColor;
	void main() {
		gl_FragColor = vColor;
	}
	`);
	gl.compileShader(fragmentShader);

	var program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);

	return program;
}

function map_to_clipspace(points) {
	return [(2*points[0]-1+trans[0]) * Math.exp(zoom)/Math.E, (2*points[1]-1+trans[1]) * Math.exp(zoom)/Math.E, 0]
}

function draw_nodes(mesh, program) {
	let points = {vertices: [], colors: []}
	for (var point of mesh.nodes) {
		points.vertices.push(...map_to_clipspace(point.pos))
		points.colors.push(...color_theme.nodes)
	}

	let positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.vertices), gl.STATIC_DRAW);

	let positionLocation = gl.getAttribLocation(program, `position`);
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

	let colorBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points.colors), gl.STATIC_DRAW);
	
	let vColorLocation = gl.getAttribLocation(program, `vColor`);
	gl.enableVertexAttribArray(vColorLocation);
	gl.vertexAttribPointer(vColorLocation, 3, gl.FLOAT, false, 0, 0);

	gl.useProgram(program);
	gl.drawArrays(gl.POINTS, 0, points.vertices.length/3);
}

function draw_tris(mesh, program) {
	gl.lineWidth(2);
	let triangles = {vertices: [], colors: []}
	let hull = {vertices: [], colors: []}
	for (var tri of mesh.faces) {
		let edges = [tri.incidentEdge, tri.incidentEdge.next, tri.incidentEdge.next.next]
		for (var edge of edges) {
			if (edge.twin == null && document.getElementById("hullCheck").checked) {
				hull.vertices.push(...map_to_clipspace(edge.orig.pos), ...map_to_clipspace(edge.dest.pos))
				hull.colors.push(...color_theme.hull, ...color_theme.hull)
			}
			else if (document.getElementById("meshCheck").checked) {
				triangles.vertices.push(...map_to_clipspace(edge.orig.pos), ...map_to_clipspace(edge.dest.pos))
				triangles.colors.push(...color_theme.delaunay, ...color_theme.delaunay)
			}
		}
	}
	triangles.vertices.push(...hull.vertices)
	triangles.colors.push(...hull.colors)

	let positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangles.vertices), gl.STATIC_DRAW);

	let positionLocation = gl.getAttribLocation(program, `position`);
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

	let colorBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(triangles.colors), gl.STATIC_DRAW);
	
	let colorLocation = gl.getAttribLocation(program, `color`);
	gl.enableVertexAttribArray(colorLocation);
	gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

	gl.useProgram(program);
	gl.drawArrays(gl.LINES, 0, triangles.vertices.length/3);
}

function draw_voronoi(mesh, program) {
	if (!document.getElementById('voronoiCheck').checked) return
	if (!(mesh && mesh.lines.length > 0)) return
	gl.lineWidth(2);
	let lines = {vertices: [], colors: []}
	for (var line of mesh.lines) {
		lines.vertices.push(...map_to_clipspace([...line[0], 0]), ...map_to_clipspace([...line[1], 0]))
		lines.colors.push(...color_theme.voronoi, ...color_theme.voronoi)
	}

	let positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines.vertices), gl.STATIC_DRAW);

	let positionLocation = gl.getAttribLocation(program, `position`);
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

	let colorBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines.colors), gl.STATIC_DRAW);
	
	let colorLocation = gl.getAttribLocation(program, `color`);
	gl.enableVertexAttribArray(colorLocation);
	gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

	gl.useProgram(program);
	gl.drawArrays(gl.LINES, 0, lines.vertices.length/3);
}

function resetDivSets() {
    for (; divSetNdx < divSets.length; ++divSetNdx) {
      divSets[divSetNdx].style.display = "none";
    }
    divSetNdx = 0;
}

function addDivSet(msg, x, y, color="black", isTriangle = false) {
    
    var divSet = divSets[divSetNdx++];

    if (!divSet) { // Si n'existe pas, la creer
      divSet = {};
      divSet.div = document.createElement("div");
      divSet.textNode = document.createTextNode("");
      divSet.style = divSet.div.style;
      divSet.div.className = "floating-div";

      // Ajout du texte au noeud
      divSet.div.appendChild(divSet.textNode);

      // Ajout de la div au container
      divContainerElement.appendChild(divSet.div);
      divSets.push(divSet);
    }

    // Affichage et style
    divSet.style.display = "block";
    if (isTriangle){
        divSet.style.left = Math.floor(x) -5 + "px";
        divSet.style.top = Math.floor(y) -10+ "px";
    }else{
        divSet.style.left = Math.floor(x) + "px";
        divSet.style.top = Math.floor(y) + "px";
        divSet.style.margin = "1px"
    }
    divSet.style.color = color;
    divSet.textNode.nodeValue = msg;
}
//#endregion

function create_mesh_from_nodes(data) {
	let mesh = {
		faces: [],
		edges: [],
		nodes: [],
		boundary: []
	}
	for (var i = 0; i < data.length; i++) {
		mesh.nodes.push({id: i, pos: data[i]})
	}
	return mesh
}

function is_in_circumcircle(point, triangle) {
	// https://en.wikipedia.org/wiki/Delaunay_triangulation#Algorithms
	let first_edge = triangle.incidentEdge
	let A = first_edge.orig.pos
	let B = first_edge.dest.pos
	let C = first_edge.next.dest.pos
	let D = point.pos
	let Ax = A[0], Ay = A[1]
	let Bx = B[0], By = B[1]
	let Cx = C[0], Cy = C[1]
	let Dx = D[0], Dy = D[1]
	let det = 	(Ax-Dx)*(By-Dy)*((Cx*Cx-Dx*Dx)+(Cy*Cy-Dy*Dy)) +
				(Bx-Dx)*(Cy-Dy)*((Ax*Ax-Dx*Dx)+(Ay*Ay-Dy*Dy)) +
				(Cx-Dx)*(Ay-Dy)*((Bx*Bx-Dx*Dx)+(By*By-Dy*Dy)) +
				-((Ax-Dx)*((Bx*Bx-Dx*Dx)+(By*By-Dy*Dy))*(Cy-Dy)) +
				-((Bx-Dx)*((Cx*Cx-Dx*Dx)+(Cy*Cy-Dy*Dy))*(Ay-Dy)) +
				-((Cx-Dx)*((Ax*Ax-Dx*Dx)+(Ay*Ay-Dy*Dy))*(By-Dy))
	return det > 0
}

function select_seed_point(mesh) {
	let seed_idx = Math.floor(Math.random() * mesh.nodes.length)
	return mesh.nodes[seed_idx]
}

const dist = function(a, b) {let dx = a[0]-b[0], dy = a[1]-b[1]; return Math.sqrt((dx*dx)+(dy*dy))}
function sort_points(mesh, p) {
	let result = [...mesh.nodes]
	result.sort(function(a, b) {return -dist(b.pos, p)+dist(a.pos, p)})
	return result.map(e => e.id)
}

function circumradius(A, B, C) {
	// https://study.com/academy/lesson/circumradius-definition-formula.html
	let a = dist(B.pos, C.pos), b = dist(C.pos, A.pos), c = dist(A.pos, B.pos)
	return a*b*c / Math.sqrt((a+b+c)*(b+c-a)*(c+a-b)*(a+b-c))
}

function circumcenter(A, B, C) {
	let ax = A[0], ay = A[1]
	let bx = B[0], by = B[1]
	let cx = C[0], cy = C[1]
    let d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    let ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    let uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
	return [ux, uy]
}

function smallest_circumradius(p, q, sorted_points, mesh) {
	let min_R = -1, min_id = -1, k
	for (var i = 2; i < sorted_points.length; i++) {
		k = mesh.nodes[sorted_points[i]]
		// could precompute dist(p, q)
		let R = circumradius(p, q, k)
		if (isNaN(R)) continue
		if (R < min_R || min_R == -1) {
			min_R = R
			min_id = k.id
		}
		// potentially avoids going through every point
		if (min_R < dist(p, k.pos))
			break
	}
	return [min_id, circumcenter(p.pos, q.pos, mesh.nodes[min_id].pos)]
}

function is_point_on_left(A, B, P) {
	// Is the orth component of AP pointing in the same direction as the normal of AB?
	let d = (P.pos[0] - A.pos[0])*(B.pos[1] - A.pos[1]) - (P.pos[1] - A.pos[1])*(B.pos[0] - A.pos[0])
	return d <= 0
}

function edge_normal(edge) {
	let x = edge.dest.pos[0] - edge.orig.pos[0]
	let y = edge.dest.pos[1] - edge.orig.pos[1]
	return [y, -x]
}

function twin_hash(edge) {
	let id = [edge.orig.id, edge.dest.id]
	id.sort()
	return id.toString()
}

function update_twins(twins, edge) {
	let hash = twin_hash(edge)
	if (twins.hasOwnProperty(hash)) {
		twins[hash]['twin'] = edge
		edge['twin'] = twins[hash]
		delete twins[hash]
	} 
	else {
		twins[hash] = edge
	}
	return twins
}

function s_hull_add_node(mesh, sorted_points, i) {
	let new_boundary = []
	let twins = {}
	for (var e of mesh.boundary) {
		let point = mesh.nodes[sorted_points[i]]
		if (is_point_on_left(e.orig, e.dest, point)) {
			new_boundary.push(e)
			continue
		}
		mesh.edges.push({orig: e.orig, dest: point, twin: null})
		mesh.edges.push({orig: point, dest: e.dest, twin: null})
		mesh.edges.push({orig: e.dest, dest: e.orig, twin: null})
		let E = mesh.edges.length
		mesh.edges[E-3]['next'] = mesh.edges[E-2]
		mesh.edges[E-2]['next'] = mesh.edges[E-1]
		mesh.edges[E-1]['next'] = mesh.edges[E-3]
		for (var e of [mesh.edges[E-3], mesh.edges[E-2], mesh.edges[E-1], e]) {
			twins = update_twins(twins, e)
		}
		let id = mesh.nodes.length + mesh.faces.length-1
		mesh.faces.push({incidentEdge: mesh.edges[E-3], id: id})
		mesh.edges[E-3]['incidentFace'] = mesh.faces[mesh.faces.length-1]
		mesh.edges[E-2]['incidentFace'] = mesh.faces[mesh.faces.length-1]
		mesh.edges[E-1]['incidentFace'] = mesh.faces[mesh.faces.length-1]
	}
	for (const [key, val] of Object.entries(twins)) {
		new_boundary.push(val)
	}
	mesh.boundary = new_boundary
	return mesh
}

function addListeners() {
	element = document.getElementById('wrapper')
	element.addEventListener('mousedown', (e) => {
		dragStart = {
			x: e.pageX - element.offsetLeft,
			y: e.pageY - element.offsetTop
		}

		mousemove = false;
		drag = true;
	});

	element.addEventListener('mousemove', (e) => {
		mousemove = true;
		if (!drag) return;
		var mousePos = {
			x: e.pageX - element.offsetLeft,
			y: e.pageY - element.offsetTop
		}
		trans[0] += (mousePos.x - dragStart.x)/canvasWidth*2/(Math.exp(zoom)/Math.E);
		trans[1] -= (mousePos.y - dragStart.y)/canvasHeight*2/(Math.exp(zoom)/Math.E);
		dragStart = mousePos;

		redraw();
	});

	element.addEventListener('mouseup', () => {
		drag = false;
	});

	element.addEventListener('mouseleave', () => {
		drag = false;
	});

	element.addEventListener('wheel', (e) => {
		var delta = e.wheelDelta / 120 / 10;
		zoom += delta;
		e.preventDefault();
		redraw();
	})

	function invX(x) {
		return ((2*x-1)/(Math.exp(zoom)/Math.E)+1-trans[0])/2;
	}
	function invY(y) {
		return ((2*y-1)/(Math.exp(zoom)/Math.E)+1-trans[1])/2;
	}
	element.addEventListener('click', async (e)=>{
		if (mousemove) return
		if (running) return
		var mousePos = {
			x: invX((e.pageX - element.offsetLeft)/canvasWidth),
			y: invY(1-(e.pageY - element.offsetTop)/canvasWidth)
		}
		for (var node of nodeData) if (node[0] === mousePos.x && node[1] === mousePos.y) return
		nodeData.push([mousePos.x, mousePos.y, 0])
		Dmesh = create_mesh_from_nodes(nodeData)
		Vmesh = {lines: []}
		if (interactive)
			await start()
		redraw()
	})

	let node_selector = document.getElementById('node_select')
	node_selector.addEventListener('change', (e)=> {
		if (node_selector.value == 'custom') {
			document.getElementsByClassName('custom-file-input')[0].style.display = 'Inline'
		} 
		else {
			document.getElementsByClassName('custom-file-input')[0].style.display = 'None'
		}
		nodeData = get_nodeData()
		Dmesh = create_mesh_from_nodes(nodeData)
		Vmesh = {lines: []}
		redraw()
	})
	if (node_selector.value == 'custom') {
		document.getElementsByClassName('custom-file-input')[0].style.display = 'Inline'
	} 

	let custom_selector = document.getElementById('custom_nodes')
	custom_selector.addEventListener('change', (e) => {
		var reader = new FileReader()
		let file = custom_selector.files[0]
		reader.onload = function(e) {
			nodeData = [...JSON.parse(e.target.result).nodes]
			Dmesh = create_mesh_from_nodes(nodeData)
			Vmesh = {lines: []}
			redraw()
		}
		reader.readAsText(file)
	})

	let theme_selector = document.getElementById('theme_select')
	theme_selector.addEventListener('change', (e) => {
		color_theme = color_themes[e.target.value]
		redraw()
	})
1
	var numberCheck = document.getElementById("points")
	numberCheck.addEventListener('change', (e)=> {
		resetDivSets()
		redraw()
	})

	var hullCheck = document.getElementById("hullCheck")
	hullCheck.addEventListener('change', (e)=> {
		redraw()
	})

	var meshCheck = document.getElementById("meshCheck")
	meshCheck.addEventListener('change', (e)=> {
		redraw()
	})

	var voronoicheck = document.getElementById('voronoiCheck')
	voronoicheck.addEventListener('change', (e) => {
		redraw()
	})
}

function find_seed_hull(mesh) {
	let seed = select_seed_point(mesh)
	log(`seed = ${seed.id}`)
	let sorted_points = sort_points(mesh, seed.pos)
	let closest = mesh.nodes[sorted_points[1]]
	log(`closest = ${closest.id}`)
	let tmp = smallest_circumradius(seed, closest, sorted_points, mesh)
	let third = mesh.nodes[tmp[0]]
	log(`third = ${third.id}`)
	let center = tmp[1]
	let order
	// order points counter-clockwise to form the initial convex hull
	if (is_point_on_left(seed, closest, third))
		order = [seed, closest, third]
	else 
		order = [seed, third, closest]
	sorted_points = sort_points(mesh, center)

	// Find the seed hull
	mesh.edges.push({orig: order[0], dest: order[1], twin: null})
	mesh.edges.push({orig: order[1], dest: order[2], twin: null})
	mesh.edges.push({orig: order[2], dest: order[0], twin: null})
	mesh.edges[0]["next"] = mesh.edges[1]
	mesh.edges[1]["next"] = mesh.edges[2]
	mesh.edges[2]["next"] = mesh.edges[0]
	mesh.faces.push({incidentEdge: mesh.edges[0], id: mesh.nodes.length})
	mesh.edges[0]["incidentFace"] = mesh.faces[0]
	mesh.edges[1]["incidentFace"] = mesh.faces[0]
	mesh.edges[2]["incidentFace"] = mesh.faces[0]
	mesh.boundary.push(mesh.edges[0])
	mesh.boundary.push(mesh.edges[1])
	mesh.boundary.push(mesh.edges[2])

	return [mesh, sorted_points, [seed.id, closest.id, third.id]]
}

function norm(vec) {
	return Math.sqrt(vec[0]*vec[0]+vec[1]*vec[1])
}

function voronoi(mesh) {
	let Vmesh = {
		lines: []
	}
	for (var i = 0; i < mesh.faces.length; i++) {
		let edge = mesh.faces[i].incidentEdge
		mesh.faces[i]['circumcenter'] = circumcenter(edge.orig.pos, edge.dest.pos, edge.next.dest.pos)
	}
	visited = new Set()
	for (edge of mesh.edges) {
		if (visited.has(edge)) {
			continue
		}
		var other
		if (edge.twin == null) {
			let A = edge.orig.pos
			let B = edge.dest.pos
			let mid_edge = [(A[0]+B[0])/2, (A[1]+B[1])/2]
			let diff = [edge.incidentFace.circumcenter[0] - mid_edge[0], edge.incidentFace.circumcenter[1] - mid_edge[1]]
			let diffnorm = norm(diff)
			var direction = [diff[0]/diffnorm, diff[1]/diffnorm]
			if (is_point_on_left(edge.orig, edge.dest, {pos: edge.incidentFace.circumcenter})) {
				direction = [-direction[0], -direction[1]]
			}
			other = [edge.incidentFace.circumcenter[0]+1000*direction[0],edge.incidentFace.circumcenter[1]+1000*direction[1]]
		}
		else 
			other = edge.twin.incidentFace.circumcenter
		Vmesh.lines.push([edge.incidentFace.circumcenter, other])
		visited.add(edge.twin)
	}
	return Vmesh
}

async function sleep(t) {await new Promise(r => setTimeout(r, t));}

async function s_hull(mesh, delay_start, delay_step, show_every=1) {
	if (mesh.nodes.length < 3) return mesh
	let tmp = find_seed_hull(mesh)
	mesh = tmp[0]
	let sorted_points = tmp[1]
	let ids = tmp[2]

	// Add nodes one by one by connecting it to visible faces
	var step = 0
	if (delay_start > 0) await sleep(delay_start)
	for (var i = 0; i < mesh.nodes.length; i++) {
		if (please_stop) return mesh
		if (sorted_points[i].id in ids) continue
		mesh = s_hull_add_node(mesh, sorted_points, i)
		if (delay_step > 0 && (++step) == show_every) {
			step = 0
			await sleep(delay_step)
			redraw()
		}
	}
	return mesh
}

function redraw(mesh=Dmesh) {
	resetDivSets()
	gl.clearColor(...color_theme.bg, 1.)
	gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

	draw_tris(mesh, programs.tri)
	draw_nodes(mesh, programs.dot)
	draw_voronoi(Vmesh, programs.tri)
	var numberCheck = document.getElementById("points")
	if (numberCheck.checked) {
		for (node of mesh.nodes){
			let clipspace = [(node.pos[0]*2-1+trans[0])*(Math.exp(zoom)/Math.E), (node.pos[1]*2-1+trans[1])*(Math.exp(zoom)/Math.E)]
			let pixelX = (clipspace[0] *  0.5 + 0.5) * gl.canvas.width;
			let pixelY = (clipspace[1] * -0.5 + 0.5) * gl.canvas.height;

			addDivSet(`${node.id}`, pixelX, pixelY, "blue");
		}
	}
}

function length(A, B) {
	return Math.sqrt((A[0]-B[0])*(A[0]-B[0])+(A[1]-B[1])*(A[1]-B[1]))
}

// A is the vertex
function angle(A, B, C) {
	let a =	Math.atan2(C[1] - A[1], C[0] - A[0]) -
    		Math.atan2(B[1] - A[1], B[0] - A[0])
	if (Math.abs(a) > Math.PI)
		a = 2 * Math.PI - Math.abs(a)
	return Math.abs(a)
}

function flip(edge) {
	let e1 = edge.next.dest
	let e2 = edge.twin.next.dest

	let e = edge.twin.next.next
	edge.next.next['next'] = edge.twin.next
	edge.twin['next'] = edge.next.next
	edge.next.next.next.next['next'] = edge.next
	edge.next.next.next['next'] = edge.twin
	edge.next['next'] = edge
	edge['next'] = e
	
	edge['orig'] = e1
	edge['dest'] = e2
	edge.twin['orig'] = e2
	edge.twin['dest'] = e1

	edge.incidentFace['incidentEdge'] = edge
	edge.twin.incidentFace['incidentEdge'] = edge.twin
	edge.next['incidentFace'] = edge.incidentFace
	edge.next.next['incidentFace'] = edge.incidentFace
	edge.twin.next['incidentFace'] = edge.twin.incidentFace
	edge.twin.next.next['incidentFace'] = edge.twin.incidentFace
}

function do_respect_delaunay(edge) {
	if (edge.twin == null)
		return true
	let A = edge.orig.pos
	let B = edge.dest.pos
	let C = edge.next.dest.pos
	let D = edge.twin.next.dest.pos
	let sum_of_angles  = angle(C, B, A) + angle(D, A, B)
	return sum_of_angles <= Math.PI
}

async function make_delaunay(mesh, delay_start, delay_step, show_every=1) {
	if (delay_start > 0) await sleep(delay_start)
	do {
	ok = true
	var step = 0
	for (var e of mesh.edges) {
		if (please_stop) {return mesh;}
		if (!do_respect_delaunay(e)){
			ok = false
			flip(e)
			if (delay_step > 0 && (++step) == show_every) {
				step = 0
				await sleep(delay_step)
				redraw(mesh);
			}
		}
	}
	} while (!ok)
	return mesh
}

async function start() {
	if (running) return
	Dmesh = create_mesh_from_nodes(nodeData)
	Vmesh = {lines: []}
	let node_selector = document.getElementById('node_select')
	node_selector.disabled = true
	let d1 = document.getElementById("start_delay_shull")
	let d2 = document.getElementById("step_delay_shull")
	let d3 = document.getElementById("start_delay_delaunay")
	let d4 = document.getElementById("step_delay_delaunay")
	let d5 = document.getElementById("show_every_shull")
	let d6 = document.getElementById("show_every_delaunay")
	running = true
	var start = performance.now()
	Dmesh = await s_hull(Dmesh, d1.value, d2.value, d5.value)
	var end = performance.now()
	console.log("s_hull took " + (end-start) + " ms")
	redraw(Dmesh)
	start = performance.now()
	Dmesh = await make_delaunay(Dmesh, d3.value, d4.value, d6.value)
	end = performance.now()
	console.log("make_delaunay took " + (end-start) + " ms")
	if (please_stop) please_stop = false
	else {
		start = performance.now()
		Vmesh = voronoi(Dmesh)
		end = performance.now()
		console.log("voronoi took " + (end-start) + " ms")
	}
	redraw(Dmesh)
	if (running) running = false
	node_selector.disabled = false
}

function stop() {
	if (running) please_stop = true;
}

function reload() {
	if (running) return
	nodeData = get_nodeData()
	Dmesh = create_mesh_from_nodes(nodeData)
	Vmesh = {lines: []}
	redraw()
}

function get_nodeData() {
	let node_selector = document.getElementById('node_select')
	let selected_nodes = node_selector.value
	if (selected_nodes == "fine") {
		return [...nodeData_fine]
	}
	else if (selected_nodes == "coarse") {
		return [...nodeData_coarse]
	}
	else if (selected_nodes == "circle") {
		return [...nodeData_circle]
	}
	else if (selected_nodes == "circle_fine") {
		return [...nodeData_circle_fine]
	}
	else return []
}

async function main() {
	const canvas = document.getElementById("glcanvas");
	canvasWidth = canvas.width
	canvasHeight = canvas.height
	divContainerElement = document.querySelector("#divcontainer");
	
	gl = canvas.getContext('webgl');

	nodeData = get_nodeData()

	if (!gl) {
		alert('Your browser does not support WebGL');
		return;
	} else {
		console.log('It works :-)');
	}

	addListeners()

	let tri_program = create_program_tris()
	let dot_program = create_program_dots()
	programs['dot'] = dot_program
	programs['tri'] = tri_program

	Dmesh = create_mesh_from_nodes(nodeData)
	Vmesh = {lines: []}
	redraw()
}

// =========================================================
//  Reading Tracker Sign – parametric OpenSCAD model  v3
//  Choose "version" and "part" in the Customizer,
//  F6 to render, then File > Export > STL.
// =========================================================

/* [What to render] */
version = "full";  // [full, books_only]
part  = "preview"; // [preview, panel_full, panel_bottom, panel_top, splice_plate, tiles, art_tiles, base, drawer, knob]
theme = "deco";    // [deco, moon, flowers, stars, svg]
title = "Reading Tracker";        // leave empty for no title
fill_empty = "fan"; // [fan, diamond, star, book, heart, moon, sun, chevron, none]
font_text   = "Liberation Serif:style=Bold";
font_digits = "Liberation Serif:style=Bold";

/* [Panel] */
W          = 250;
arch_ry    = 77.5;
T          = 4;     // panel thickness
relief     = 0.8;   // height of the gold details
tab        = 10;
label_size = 6;

/* [Tiles and pegs] */
tile_w = 20; tile_h = 28; tile_t = 3; tile_r = 3;
tile_pitch = 24;
digit_size = 16;
peg_d = 3; peg_len = 5; hole_d = 3.6; peg_from_top = 4;
tile_sets  = 5; // rows of 0-9 on the plate (max 7 on the X2D)
art_copies = 3; // copies of each decorative tile

/* [Base and drawers] */
base_d = 70; base_h = 50; wall = 4; slot_y = 30;

/* [Hidden] */
$fa = 4; $fs = 0.4;
GOLD = "#FAC775"; DARK = "#2C2C2A";
title_on = title != "";
art_list = ["fan","diamond","star","book","heart","moon","sun","chevron"];

// Fields per row: [label, number of digits, x-centre]
rows_full = [
  [["Books read this year", 3, 66], ["Mangas read this year", 3, 183.5]],
  [["Book goal",            3, 66], ["Manga goal",            3, 183.5]],
  [["Books in my library",  4, 66], ["Mangas in my library",  4, 183.5]],
  [["Read from my library", 4, 125]]
];
rows_books = [
  [["Books read this year", 3, 66], ["Book goal",           3, 183.5]],
  [["Read from my library", 4, 66], ["Books in my library", 4, 183.5]]
];
vals_full  = [[47, 37], [60, 50], [1082, 165], [389]];
vals_books = [[47, 60], [389, 1247]];

rows           = version == "books_only" ? rows_books : rows_full;
preview_values = version == "books_only" ? vals_books : vals_full;
n_rows = len(rows);

label_y    = [for (r=[0:n_rows-1]) 84 + 67.5*(n_rows-1-r)];
H_straight = label_y[0] + 11;
garland_y  = [for (r=[0:n_rows-1]) r==0 ? label_y[0] + (title_on ? 15 : 20) : label_y[r] + 18.5];
hero_y     = H_straight + (title_on ? 44.5 : 38.5);
hero_s     = title_on ? 0.75 : 1;
title_y    = H_straight + 14;
split_y    = n_rows > 2 ? garland_y[2] : garland_y[1];
crest_y    = 25;

base_w = W + 4;
slot_depth = tab + 0.5;
ow = (base_w - 3*wall) / 2;
oh = base_h - 17;
od = base_d - 3;
dw = ow - 1; dd = od - 1.5; dh = oh - 1;

// ---------- helpers ----------
function x0(f) = f[2] - (f[1]*tile_w + (f[1]-1)*(tile_pitch-tile_w)) / 2;
function tile_x(f, i) = x0(f) + i*tile_pitch + tile_w/2;
function peg_y(r) = label_y[r] - 9 - peg_from_top;
function qb(a, b, c, t) = (1-t)*(1-t)*a + 2*(1-t)*t*b + t*t*c;

module seg(a, b, w=0.6) hull() { translate(a) circle(d=w); translate(b) circle(d=w); }
module ring(r, w=0.5) difference() { circle(r); circle(r-w); }
module star4(s) polygon([[0,s],[.3*s,.3*s],[s,0],[.3*s,-.3*s],[0,-s],[-.3*s,-.3*s],[-s,0],[-.3*s,.3*s]]);
module leaf(rot, s=1) rotate(rot) scale([3.5*s, 1.4*s]) circle(1, $fn=24);
module rr(w, h, r) offset(r=r) square([w-2*r, h-2*r], center=true);
module flower() difference() { union() for (a=[0:72:288]) rotate(a) translate([0,2.5]) circle(2); circle(1.1); }
module half_up(r) intersection() { circle(r); translate([-r-1,0]) square([2*r+2, r+1]); }

module phase(t) {
  if (t=="new") ring(2.5);
  else if (t=="cres") difference() { circle(2.5); translate([1.3,0]) circle(2.3); }
  else if (t=="half") union() { ring(2.5); intersection() { circle(2.5); translate([-2.5,-2.5]) square([2.5,5]); } }
  else if (t=="gib") union() { ring(2.5); difference() { circle(2.5); translate([3.9,0]) circle(2.5); } }
  else circle(2.75);
}

// ---------- ornaments ----------
module motif(t) {
  if (t=="moon") { ring(4.25); circle(3); }
  else if (t=="flowers") flower();
  else if (t=="stars") { difference() { circle(3.75); translate([1.75,1.25]) circle(3.25); } translate([4.5,3]) star4(1.25); }
  else difference() { rotate(45) square(6, center=true); rotate(45) square(2.5, center=true); }
}

module garland(t) {
  if (t=="svg") import("garland.svg", center=true);
  else if (t=="deco") {
    for (s=[-1,1]) for (y=[-1.5,1.5]) translate([s*57.5, y]) square([95,0.5], center=true);
    for (x=[-56.5,56.5]) translate([x,0]) rotate(45) square(4, center=true);
    for (x=[-105,105]) translate([x,0]) rotate(45) square(2.4, center=true);
    motif("deco");
  }
  else if (t=="moon") {
    ph = ["new","cres","half","gib"]; xs = [95,70,45,21];
    difference() {
      square([210, 0.5], center=true);
      circle(4.8);
      for (x = xs) { translate([x,0]) circle(3.8); translate([-x,0]) circle(3.8); }
    }
    for (i=[0:3]) { translate([-xs[i],0]) phase(ph[i]); translate([xs[i],0]) mirror([1,0]) phase(ph[i]); }
    motif("moon");
  }
  else if (t=="flowers") {
    for (x=[-105:3:102]) seg([x, 2*sin(x*360/113)], [x+3, 2*sin((x+3)*360/113)], 0.75);
    L = [[-97.5,3,25],[-75,-2,-25],[-40,-2.5,-25],[-19,3,25]];
    for (l=L) { translate([l[0],l[1]]) leaf(l[2]); translate([-l[0],l[1]]) leaf(-l[2]); }
    for (x=[-56.5,0,56.5]) translate([x,0]) flower();
  }
  else if (t=="stars") {
    translate([-57.5,0]) square([95,0.5], center=true);
    translate([57.5,0]) square([95,0.5], center=true);
    for (p=[[30,2.75],[60,1.75],[90,2.75]]) { translate([p[0],0]) star4(p[1]); translate([-p[0],0]) star4(p[1]); }
    for (x=[45,75,102]) { translate([x,-3]) circle(0.65); translate([-x,3]) circle(0.65); }
    motif("stars");
  }
}

module crest(t) {
  if (t=="deco") {
    difference() { garland(t); circle(16); }
    for (a=[-70:14:70]) seg([0,-4], [15*sin(a), -4+15*cos(a)], 0.75);
    translate([0,-4]) half_up(4);
    translate([0,-4.75]) square([32,1.5], center=true);
  } else {
    difference() { garland(t); circle(10.5); translate([-30,1]) circle(6.5); translate([30,1]) circle(6.5); }
    scale(2.2) motif(t);
    translate([-30,1]) scale(1.4) motif(t);
    translate([30,1]) scale(1.4) motif(t);
  }
}

module vdiv(t) {
  difference() { union() for (y=[-25:3:25]) translate([0,y]) square([0.5,1.4], center=true); circle(5); }
  motif(t);
}

module hero(t) {
  if (t=="svg") import("hero.svg", center=true);
  else if (t=="deco") {
    for (a=[-80:10:80]) seg([0,-20], [36*sin(a), -20+36*cos(a)], 0.75);
    for (r=[17,26,36]) translate([0,-20]) intersection() { ring(r,0.75); translate([-r-1,0]) square([2*r+2, r+1]); }
    translate([0,-20]) half_up(10);
    translate([0,20]) rotate(45) square(6, center=true);
    translate([0,-20.75]) square([100,1.5], center=true);
    for (x=[-50,50]) translate([x,-20]) rotate(45) square(4, center=true);
  }
  else if (t=="moon") {
    A = [-175,-150,-125,-101]; ph = ["new","cres","half","gib"];
    translate([0,-4]) difference() {
      circle(15);
      translate([-4.5,4]) circle(2.5); translate([4,-3]) circle(3.5);
      translate([6,3]) circle(1.5);   translate([-3,-7]) circle(1.5);
    }
    difference() {
      union() for (a=[-180:6:0]) translate([30*cos(a), -4-30*sin(a)]) circle(0.4);
      for (a=A) { translate([30*cos(a), -4-30*sin(a)]) circle(5.5); translate([-30*cos(a), -4-30*sin(a)]) circle(5.5); }
    }
    for (i=[0:3]) {
      translate([30*cos(A[i]), -4-30*sin(A[i])]) scale(1.5) phase(ph[i]);
      translate([-30*cos(A[i]), -4-30*sin(A[i])]) mirror([1,0]) scale(1.5) phase(ph[i]);
    }
    translate([-45,-15]) star4(2); translate([45,-15]) star4(2);
  }
  else if (t=="flowers") {
    E = [[-36,1,1.2],[-20,12,1.3],[0,18,1.6],[20,12,1.3],[36,1,1.2],[-51,-9,0.9],[51,-9,0.9]];
    for (e=E) for (i=[0:9])
      seg(qb([0,-20],[e[0]*0.3,(e[1]-20)/2],[e[0],e[1]],i/10),
          qb([0,-20],[e[0]*0.3,(e[1]-20)/2],[e[0],e[1]],(i+1)/10), 0.75);
    for (l=[[-15,-9,40,1.6],[15,-9,-40,1.6],[-31,-12,15,1.4],[31,-12,-15,1.4],[-7,-2,70,1.3],[7,-2,-70,1.3]])
      translate([l[0],l[1]]) leaf(l[2], l[3]);
    for (e=E) translate([e[0],e[1]]) scale(e[2]) flower();
    for (s=[-1,1]) translate([s*4.5,-19]) difference() { scale([4.5,2]) circle(1); scale([3.6,1.2]) circle(1); }
    translate([0,-19]) circle(1.5);
  }
  else if (t=="stars") {
    difference() { translate([-2.5,-1]) circle(19); translate([5,4]) circle(17); }
    for (s=[[24,11,3.5],[33,-6,2.5],[-35,4,2],[19,-14,2],[-22.5,-17,1.5],[42,3,1.5],
            [-46,-11,2.5],[11,21,1.5],[50,-15,1.5],[30,19,1.25]])
      translate([s[0],s[1]]) star4(s[2]);
  }
}

// ---------- decorative tile artwork ----------
module tile_art(k) {
  if (k=="fan") {
    for (a=[-45:15:45]) seg([0,-6], [11*sin(a), -6+11*cos(a)], 0.8);
    translate([0,-6]) half_up(3.5);
    translate([0,-6.6]) square([14,1.2], center=true);
  }
  else if (k=="diamond") {
    difference() { rotate(45) square(11, center=true); rotate(45) square(9.4, center=true); }
    rotate(45) square(5.5, center=true);
  }
  else if (k=="star")
    polygon([for (i=[0:9]) let(r = i%2==0 ? 7.5 : 3, a = 90 + i*36) [r*cos(a), r*sin(a)]]);
  else if (k=="book")
    difference() {
      scale(0.75) polygon([[-10,4],[-5,6],[0,4],[5,6],[10,4],[10,-6],[5,-3],[0,-6],[-5,-3],[-10,-6]]);
      square([0.8,12], center=true);
    }
  else if (k=="heart")
    for (s=[-1,1]) hull() { translate([s*2.8,2]) circle(3.4); translate([0,-6.5]) circle(0.4); }
  else if (k=="moon") {
    difference() { circle(7); translate([3,2]) circle(6); }
    translate([3.5,-2.5]) star4(1.8);
  }
  else if (k=="sun") {
    circle(3.2);
    for (a=[0:45:315]) seg([4.5*cos(a), 4.5*sin(a)], [7.2*cos(a), 7.2*sin(a)], 1);
  }
  else if (k=="chevron")
    for (y=[-5,-0.5,4]) { seg([-7,y-3],[0,y+1.5],0.9); seg([0,y+1.5],[7,y-3],0.9); }
}

// ---------- panel ----------
module panel_main() union() {
  square([W, H_straight]);
  translate([W/2, H_straight]) scale([W/2, arch_ry]) circle(1, $fn=200);
}
module panel_shape() union() { panel_main(); translate([5,-tab]) square([W-10, tab+1]); }

module gold_2d() union() {
  difference() { offset(r=-6) panel_main(); offset(r=-6.8) panel_main(); }
  for (r=[0:n_rows-1]) for (f=rows[r])
    translate([f[2], label_y[r]]) text(f[0], size=label_size, font=font_text, halign="center");
  for (y=garland_y) translate([W/2, y]) garland(theme);
  translate([W/2, crest_y]) crest(theme);
  for (r=[0:n_rows-1]) if (len(rows[r])==2) translate([W/2, label_y[r]-20]) vdiv(theme);
  translate([W/2, hero_y]) scale(hero_s) hero(theme);
  if (title_on) translate([W/2, title_y]) text(title, size=9, font=font_text, halign="center");
}

module panel() {
  color(DARK) linear_extrude(T) panel_shape();
  color(GOLD) translate([0,0,T]) linear_extrude(relief) gold_2d();
  color(GOLD) for (r=[0:n_rows-1]) for (f=rows[r]) for (i=[0:f[1]-1])
    translate([tile_x(f,i), peg_y(r), T]) cylinder(d=peg_d, h=peg_len);
}

module panel_cut(top) intersection() {
  panel();
  if (top) translate([-1, split_y, -1]) cube([W+2, 300, 50]);
  else     translate([-1, -tab-1, -1]) cube([W+2, split_y+tab+1, 50]);
}

// ---------- tiles ----------
module tile_frame() {
  difference() {
    union() {
      color(DARK) linear_extrude(tile_t) rr(tile_w, tile_h, tile_r);
      color(GOLD) translate([0,0,tile_t]) linear_extrude(relief) union() {
        difference() { rr(tile_w-1.6, tile_h-1.6, tile_r-0.8); rr(tile_w-2.6, tile_h-2.6, tile_r-1.3); }
        translate([0, tile_h/2-peg_from_top]) circle(d=hole_d+1.6);
        children();
      }
    }
    translate([0, tile_h/2-peg_from_top, -1]) cylinder(d=hole_d, h=tile_t+relief+2);
  }
}
module tile(d) tile_frame() translate([0,-3]) text(str(d), size=digit_size, font=font_digits, halign="center", valign="center");
module art_tile(k) tile_frame() translate([0,-3]) tile_art(k);

module tile_plate() for (s=[0:tile_sets-1]) for (d=[0:9])
  translate([d*tile_pitch, s*(tile_h+4)]) tile(d);
module art_plate() for (c=[0:len(art_list)-1]) for (s=[0:art_copies-1])
  translate([c*tile_pitch, s*(tile_h+4)]) art_tile(art_list[c]);

// ---------- base, drawers, knobs ----------
module base() color("#444441") difference() {
  cube([base_w, base_d, base_h]);
  for (i=[0,1]) translate([wall + i*(ow+wall), -1, 3]) cube([ow, od+1, oh]);
  translate([(base_w-(W-10))/2 - 0.3, slot_y, base_h - slot_depth]) cube([W-10+0.6, T+0.4, slot_depth+1]);
}

module drawer() {
  color(DARK) difference() { cube([dw, dd, dh]); translate([1.6, 1.6, 1.2]) cube([dw-3.2, dd-3.2, dh]); }
  color(DARK) for (i=[1:4]) translate([1.6 + i*(dw-3.2)/5 - 0.6, 0, 0]) cube([1.2, dd, dh*0.8]);
  color(DARK) translate([-1.5, -2.5, 0]) cube([dw+3, 2.5, dh+1]);
  color(DARK) translate([dw/2, -2.5, (dh+1)/2]) rotate([90,0,0]) cylinder(d=4, h=2.5);
}

module knob(t) {
  difference() {
    color(DARK) linear_extrude(3) offset(r=1.2) hull() scale(2) motif(t);
    translate([0,0,-0.01]) cylinder(d=4.4, h=2.6);
  }
  color(GOLD) translate([0,0,3]) linear_extrude(1.5) scale(2) motif(t);
}

// ---------- preview ----------
module assembly() {
  base();
  for (i=[0,1]) translate([wall + i*(ow+wall) + 0.5, 0, 3]) {
    drawer();
    translate([dw/2, -2.5-2.5, (dh+1)/2]) rotate([90,0,0]) knob(theme);
  }
  z0 = base_h - slot_depth + tab;
  px = (base_w - W)/2;
  translate([px, slot_y + 0.2 + T, z0]) rotate([90,0,0]) panel();
  ty = slot_y + 0.2 - relief - 0.3;
  for (r=[0:n_rows-1]) for (c=[0:len(rows[r])-1]) {
    f = rows[r][c]; v = str(preview_values[r][c]); n = f[1]; L = len(v);
    for (i=[0:n-1])
      translate([px + tile_x(f,i), ty, z0 + peg_y(r) - (tile_h/2 - peg_from_top)])
        rotate([90,0,0]) {
          if (i >= n-L) tile(v[i-(n-L)]);
          else if (fill_empty != "none") art_tile(fill_empty);
        }
  }
}

// ---------- output ----------
if      (part=="preview")      assembly();
else if (part=="panel_full")   panel();
else if (part=="panel_bottom") panel_cut(false);
else if (part=="panel_top")    panel_cut(true);
else if (part=="splice_plate") cube([140, 30, 2]);
else if (part=="tiles")        tile_plate();
else if (part=="art_tiles")    art_plate();
else if (part=="base")         base();
else if (part=="drawer")       drawer();
else if (part=="knob")         knob(theme);
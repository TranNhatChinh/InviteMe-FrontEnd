import test from "node:test";
import assert from "node:assert/strict";
import { studioDocumentSchema } from "../src/features/template-studio/schemas/document";
import { importedDocument, orderPages } from "../src/features/template-studio/imported/document";
import type { ImportedWidget } from "../src/features/template-studio/schemas/document";

const pages = [
  { id: "portrait", imageUrl: "/media/wedding/page-1.png", width: 1748, height: 2480, order: 0 },
  { id: "landscape", imageUrl: "/media/wedding/page-2.jpg", width: 1920, height: 1080, order: 1 },
];
test("imported documents retain independent page proportions and shared effects", () => {
  const document = importedDocument(pages);
  document.nodes.ROOT!.props.particles = "hearts";
  const saved = studioDocumentSchema.parse(JSON.parse(JSON.stringify(document)));
  assert.deepEqual(saved.pages, pages);
  assert.equal(saved.nodes.ROOT?.props.particles, "hearts");
  const reordered = orderPages([...pages].reverse());
  assert.deepEqual(
    reordered.map((page) => [page.id, page.order]),
    [
      ["landscape", 0],
      ["portrait", 1],
    ],
  );
});
test("invalid page lists and editable imported content are rejected", () => {
  const invalid = [
    importedDocument([]),
    importedDocument([...pages, { ...pages[0]!, order: 2 }]),
    importedDocument([{ ...pages[0]!, width: 0 }]),
    importedDocument([{ ...pages[0]!, order: 1 }]),
    importedDocument(
      Array.from({ length: 25 }, (_, order) => ({ ...pages[0]!, id: String(order), order })),
    ),
  ];
  const editable = importedDocument(pages);
  editable.nodes.ROOT!.props.text = "editable";
  invalid.push(editable);
  for (const document of invalid)
    assert.equal(studioDocumentSchema.safeParse(document).success, false);
});
test("legacy template documents remain valid and cannot accidentally contain imported pages", () => {
  const document = importedDocument(pages);
  delete document.kind;
  delete document.pages;
  assert.equal(studioDocumentSchema.safeParse(document).success, true);
  document.pages = pages;
  assert.equal(studioDocumentSchema.safeParse(document).success, false);
});

const widget:ImportedWidget={id:"rsvp",pageId:"portrait",type:"RSVP",enabled:true,x:.25,y:.8,width:.5,height:.08,label:"RSVP",backgroundColor:"#cf7892",textColor:"#ffffff"};
test("RSVP overlays round-trip independently of page order and image replacement",()=>{
  const doc={...importedDocument(pages),widgets:[widget]};
  const next={...doc,pages:orderPages([{...pages[1]!},{...pages[0]!,imageUrl:"/media/wedding/replaced.png"}])};
  assert.deepEqual(studioDocumentSchema.parse(next).widgets,[widget]);
});
test("overlays reject missing pages, duplicate identifiers and out-of-bounds rectangles",()=>{
  for(const value of [{...widget,pageId:"missing"},{...widget,x:.9},{...widget,y:1},{...widget,width:0},{...widget,label:" "},{...widget,backgroundColor:"red"}]) {
    assert.equal(studioDocumentSchema.safeParse({...importedDocument(pages),widgets:[value]}).success,false);
  }
  assert.equal(studioDocumentSchema.safeParse({...importedDocument(pages),widgets:[widget,widget]}).success,false);
});

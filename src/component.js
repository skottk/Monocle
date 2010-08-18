/* COMPONENT */

// See the properties declaration for details of constructor arguments.
//
Monocle.Component = function (book, id, index, chapters, source) {

  var API = { constructor: Monocle.Component }
  var k = API.constants = API.constructor;
  var p = API.properties = {
    // a back-reference to the public API of the book that owns this component
    book: book,

    // the string that represents this component in the book's component array
    id: id,

    // the position in the book's components array of this component
    index: index,

    // The chapters argument is an array of objects that list the chapters that
    // can be found in this component. A chapter object is defined as:
    //
    //  {
    //     title: str,
    //     fragment: str, // optional anchor id
    //     percent: n     // how far into the component the chapter begins
    //  }
    //
    // NOTE: the percent property is calculated by the component - you only need
    // to pass in the title and the optional id string.
    //
    chapters: chapters,

    // the frame provided by dataSource.getComponent() for this component
    source: source,

    // The array of pageDivs that have applied this component. Indexed by
    // their pageIndex.
    pageDivs: [],

    // The current dimensions of the client node that holds the elements of
    // this component. (The assumption is that all client nodes will have
    // identical dimensions — otherwise nothing will work as expected.)
    //
    // Defined as:
    //
    //   {
    //     width: n,            // in pixels
    //     height: n,           // in pixels
    //     scrollWidth: n,      // in pixels
    //     fontSize: s,         // css style property value of the node
    //     pages: n             // number of pages in this component
    //   }
    //
    // Obviously, this data is invalidated by dimensional changes in the reader.
    //
    clientDimensions: []
  }


  // Returns true if this component is the active component for the pageDiv.
  //
  function currentlyApplyingTo(pageDiv) {
    return pageDiv.m.activeFrame.m.component == API;
  }


  // Makes this component the active component for the pageDiv. There are
  // several strategies for this (see loadFrame).
  //
  // Some strategies are time-consuming (and usually asynchronous), some are
  // not. When the component has been loaded into the pageDiv's frame, the
  // callback will be invoked with the pageDiv and this component as arguments.
  //
  function applyTo(pageDiv, callback) {
    if (currentlyApplyingTo(pageDiv)) {
      return;
    }

    p.pageDivs[pageDiv.m.pageIndex] = pageDiv;

    var evtData = { 'page': pageDiv, 'source': p.source };
    pageDiv.m.reader.dispatchEvent('monocle:componentchanging', evtData);

    return loadFrame(
      pageDiv,
      function () {
        setupFrame(pageDiv, pageDiv.m.activeFrame);
        callback(pageDiv, API);
      }
    );
  }


  // Loads this component into the given frame, using one of the following
  // strategies:
  //
  // * HTML - a HTML string
  // * URL - a URL string
  // * Nodes - an array of DOM body nodes (NB: no way to populate head)
  // * Document - a DOM DocumentElement object
  //
  function loadFrame(pageDiv, callback) {
    var frame = pageDiv.m.activeFrame;

    // We own this frame now.
    frame.m.component = API;

    // Hide the frame while we're changing it.
    frame.style.visibility = "hidden";

    // Prevent about:blank overriding imported nodes in Firefox.
    // Disabled again because it seems to result in blank pages in Saf.
    //frame.contentWindow.stop();

    if (p.source.html || (typeof p.source == "string")) {   // HTML
      return loadFrameFromHTML(p.source.html || p.source, frame, callback);
    } else if (p.source.url) {                              // URL
      return loadFrameFromURL(p.source.url, frame, callback);
    } else if (p.source.nodes) {                            // NODES
      return loadFrameFromNodes(p.source.nodes, frame, callback);
    } else if (p.source.doc) {                              // DOCUMENT
      return loadFrameFromDocument(p.source.doc, frame, callback);
    }
  }


  // LOAD STRATEGY: HTML
  // Loads a HTML string into the given frame, invokes the callback once loaded.
  //
  function loadFrameFromHTML(src, frame, callback) {
    // Compress whitespace.
    src = src.replace(/\s+/g, ' ');

    // Escape single-quotes.
    src = src.replace(/\'/g, '\\\'');

    // Remove scripts. (DISABLED -- Monocle should leave this to implementers.)
    //var scriptFragment = "<script[^>]*>([\\S\\s]*?)<\/script>";
    //src = src.replace(new RegExp(scriptFragment, 'img'), '');

    // BROWSERHACK: Gecko chokes on the DOCTYPE declaration.
    if (Monocle.Browser.is.Gecko) {
      var doctypeFragment = "<!DOCTYPE[^>]*>";
      src = src.replace(new RegExp(doctypeFragment, 'm'), '');
    }

    src = "javascript: '" + src + "';";

    frame.onload = function () {
      frame.onload = null;
      Monocle.defer(callback);
    }
    frame.src = src;
  }


  // LOAD STRATEGY: URL
  // Loads the URL into the given frame, invokes callback once loaded.
  //
  function loadFrameFromURL(url, frame, callback) {
    frame.onload = function () {
      frame.onload = null;
      Monocle.defer(callback);
    }
    frame.src = url;
  }


  // LOAD STRATEGY: NODES
  // Loads the array of DOM nodes into the body of the frame (replacing all
  // existing nodes), then invokes the callback.
  //
  function loadFrameFromNodes(nodes, frame, callback) {
    var destDoc = frame.contentDocument;
    destDoc.documentElement.innerHTML = "";
    var destHd = destDoc.createElement("head");
    var destBdy = destDoc.createElement("body");

    for (var i = 0; i < nodes.length; ++i) {
      var node = destDoc.importNode(nodes[i], true);
      destBdy.appendChild(node);
    }

    destDoc.documentElement.appendChild(destHd);
    destDoc.documentElement.appendChild(destBdy);

    if (callback) { callback(); }
  }


  // LOAD STRATEGY: DOCUMENT
  // Replaces the DocumentElement of the given frame with the given srcDoc.
  // Invokes the callback when loaded.
  //
  function loadFrameFromDocument(srcDoc, frame, callback) {
    var destDoc = frame.contentDocument;

    var srcBases = srcDoc.getElementsByTagName('base');
    if (srcBases[0]) {
      var head = destDoc.getElementsByTagName('head')[0];
      if (!head) {
        try {
          head = destDoc.createElement('head');
          if (destDoc.body) {
            destDoc.insertBefore(head, destDoc.body);
          } else {
            destDoc.appendChild(head);
          }
        } catch (e) {
          head = destDoc.body;
        }
      }
      var bases = destDoc.getElementsByTagName('base');
      var base = bases[0] ? bases[0] : destDoc.createElement('base');
      base.setAttribute('href', srcBases[0].getAttribute('href'));
      head.appendChild(base);
    }

    destDoc.replaceChild(
      destDoc.importNode(srcDoc.documentElement, true),
      destDoc.documentElement
    );

    // DISABLED: immediate readiness - webkit has some difficulty with this.
    // if (callback) { callback(); }

    Monocle.defer(callback);
  }


  // Once a frame is loaded with this component, call this method to style
  // and measure its contents.
  //
  function setupFrame(pageDiv, frame) {
    // BROWSERHACK: WEBKIT (touch events on iframe not sent to higher elems)
    //
    // On MobileSafari, translates a click on the iframe into a click on
    // the reader's controls div.
    // Presently required to route around MobileSafari's problems with
    // iframes. But it would be very nice to rip it out.
    if (Monocle.Browser.has.iframeTouchBug) {
      Monocle.Compat.enableTouchProxyOnFrame(frame);
    }

    // Announce that the component has changed.
    var evtData = { 'page': pageDiv, 'document': frame.contentDocument };
    pageDiv.m.reader.dispatchEvent('monocle:componentchange', evtData);

    // BROWSERHACK: WEBKIT bug - iframe needs scrollbars explicitly disabled.
    if (Monocle.Browser.is.WebKit) {
      frame.contentDocument.documentElement.style.overflow = 'hidden';
    }

    // Correct the body lineHeight to use a number, not a percentage, which
    // causes the text to jump upwards.
    var doc = frame.contentDocument;
    var win = doc.defaultView;
    var currStyle = win.getComputedStyle(doc.body, null);
    var lh = parseFloat(currStyle.getPropertyValue('line-height'));
    var fs = parseFloat(currStyle.getPropertyValue('font-size'));
    doc.body.style.lineHeight = lh / fs;

    setColumnWidth(pageDiv);
    frame.style.visibility = "visible";
    measureDimensions(pageDiv);

    // Find the place of any chapters in the component.
    locateChapters(pageDiv);
  }


  // Checks whether the pageDiv dimensions have changed. If they have,
  // calculates a new column width, re-measures the pageDiv dimensions and
  // returns true.
  //
  // Otherwise returns false.
  //
  function updateDimensions(pageDiv) {
    if (haveDimensionsChanged(pageDiv)) {
      for (var i = 0; i < p.pageDivs.length; ++i) {
        if (p.pageDivs[i]) {
          setColumnWidth(p.pageDivs[i]);
        }
      }
      measureDimensions(pageDiv);
      return true;
    } else {
      return false;
    }
  }


  // Checks whether the dimensions of the pageDiv have changed (due to
  // browser resize, reorientation, font-size change or other).
  //
  // Returns true or false.
  //
  function haveDimensionsChanged(pageDiv) {
    var newDimensions = rawDimensions(pageDiv);
    return (
      (!p.clientDimensions) ||
      (p.clientDimensions.width != newDimensions.width) ||
      (p.clientDimensions.height != newDimensions.height) ||
      (p.clientDimensions.scrollWidth != newDimensions.scrollWidth) ||
      (p.clientDimensions.fontSize != newDimensions.fontSize)
    );
  }


  // Returns the element that is offset to the left in order to display
  // a particular page.
  //
  // This is a BROWSERHACK:
  //   iOS devices don't allow scrollbars on the frame itself.
  //   This means that it's the parent div that must be scrolled -- the sheaf.
  //
  function scrollerElement(pageDiv) {
    var bdy = pageDiv.m.activeFrame.contentDocument.body;

    if (Monocle.Browser.is.MobileSafari) {
      var oldSL = bdy.scrollLeft;
      var sl = bdy.scrollLeft = bdy.scrollWidth;
      var bodyScroller = (bdy.scrollLeft != 0);
      bdy.scrollLeft = oldSL;
      return bodyScroller ? bdy : pageDiv.m.sheafDiv;
    } else {
      return bdy;
    }
  }


  // Returns the width of the offsettable area of the scroller element. By
  // definition, the number of pages is always this number divided by the
  // width of a single page (eg, the client area of the scroller element).
  //
  // BROWSERHACK:
  //
  // iOS 4+ devices sometimes report incorrect scrollWidths.
  //  1) The body scrollWidth is now always 2x what it really is.
  //  2) The sheafDiv scrollWidth is sometimes only 2x page width, despite
  //    body being much bigger.
  //
  // In Gecko browsers, translating X on the document body causes the
  // scrollWidth of the body to change. (I think this is a bug.) Hence, we
  // have to find the last element in the body, and get the 'right' value from
  // its bounding rect.
  //
  // In other browsers, we can just use the scrollWidth of the scrollerElement.
  //
  function scrollerWidth(pageDiv) {
    var bdy = pageDiv.m.activeFrame.contentDocument.body;
    if (Monocle.Browser.is.MobileSafari) {
      var sew = scrollerElement(pageDiv).scrollWidth;
      var hbw = bdy.scrollWidth / 2;
      //console.log("page["+pageDiv.m.pageIndex+"] scrollerElement: "+sew);
      //console.log("page["+pageDiv.m.pageIndex+"] half body scrollWidth: "+hbw);
      return Math.max(sew, hbw);
    } else if (Monocle.Browser.is.Gecko) {
      var lc = bdy.lastChild;
      while (lc && lc.nodeType != 1) {
        lc = lc.previousSibling;
      }
      var bcr = lc.getBoundingClientRect();
      //console.log("page["+pageDiv.m.pageIndex+"] bounding rect: " + bcr.right);
      return bcr.right;
    } else {
      return scrollerElement(pageDiv).scrollWidth;
    }
  }


  // Calculate the dimensions of the component within the given pageDiv.
  // Includes the number of pages.
  //
  function measureDimensions(pageDiv) {
    p.clientDimensions = rawDimensions(pageDiv);

    // Detect single-page components.
    if (p.clientDimensions.scrollWidth == p.clientDimensions.width * 2) {
      var doc = pageDiv.m.activeFrame.contentDocument;
      var elems = doc.body.getElementsByTagName('*');
      if (!elems || elems.length == 0) {
        console.warn(
          "Empty document body for pageDiv["+pageDiv.m.pageIndex+"]: "+id
        );
        return;
      }
      var elem = elems[elems.length - 1];
      var lcEnd = elem.offsetTop + elem.offsetHeight;
      p.clientDimensions.scrollWidth = p.clientDimensions.width *
        (lcEnd > p.clientDimensions.height ? 2 : 1);
    }

    p.clientDimensions.pages = Math.ceil(
      p.clientDimensions.scrollWidth / p.clientDimensions.width
    );

    // console.log(
    //   ""+id+" -> pageDiv["+pageDiv.m.pageIndex+"] -> page count: " +
    //   p.clientDimensions.pages
    // );

    return p.clientDimensions;
  }


  // Gets the basic dimensions of the component within the pageDiv, not
  // including advanced calculations like the number of pages.
  //
  function rawDimensions(pageDiv) {
    var win = pageDiv.m.activeFrame.contentWindow;
    var doc = win.document;
    var currStyle = win.getComputedStyle(doc.body, null);

    return {
      width: pageDiv.m.sheafDiv.clientWidth,
      height: pageDiv.m.sheafDiv.clientHeight,
      scrollWidth: scrollerWidth(pageDiv),
      fontSize: currStyle.getPropertyValue('font-size')
    }
  }


  function setColumnWidth(pageDiv) {
    var doc = pageDiv.m.activeFrame.contentDocument;
    var cw = pageDiv.m.sheafDiv.clientWidth;
    doc.body.style.columnWidth = cw+"px";
    doc.body.style.MozColumnWidth = cw+"px";
    doc.body.style.webkitColumnWidth = cw+"px";
  }


  // Iterates over all the chapters that are within this component
  // (according to the array we were provided on initialization) and finds
  // their location (in percentage terms) within the text.
  //
  // Location is calculated using scrollIntoView.
  //
  // Stores this percentage with the chapter object in the chapters array.
  //
  function locateChapters(pageDiv) {
    if (p.chapters[0] && typeof p.chapters[0].percent == "number") {
      return;
    }
    var doc = pageDiv.m.activeFrame.contentDocument;
    var scroller = scrollerElement(pageDiv);
    var oldScrollLeft = scroller.scrollLeft;
    for (var i = 0; i < p.chapters.length; ++i) {
      var chp = p.chapters[i];
      chp.percent = 0;
      if (chp.fragment) {
        var target = doc.getElementById(chp.fragment);
        while (target && target.parentNode != doc.body) {
          target = target.parentNode;
        }
        if (target) {
          target.scrollIntoView();
          chp.percent = (scroller.scrollLeft / p.clientDimensions.scrollWidth);
        }
      }
    }
    scroller.scrollTop = 0;
    scroller.scrollLeft = oldScrollLeft;

    return p.chapters;
  }


  // For a given page number within the component, return the chapter that
  // starts on or most-recently-before this page.
  //
  // Useful, for example, in displaying the current chapter title as a
  // running head on the page.
  //
  function chapterForPage(pageN) {
    var cand = null;
    var percent = (pageN - 1) / p.clientDimensions.pages;
    for (var i = 0; i < p.chapters.length; ++i) {
      if (percent >= p.chapters[i].percent) {
        cand = p.chapters[i];
      } else {
        return cand;
      }
    }
    return cand;
  }


  // For a given chapter fragment (the bit after the hash
  // in eg, "index.html#foo"), return the page number on which
  // the chapter starts. If the fragment is null or blank, will
  // return the first page of the component.
  //
  function pageForChapter(fragment) {
    if (!fragment) {
      return 1;
    }
    for (var i = 0; i < p.chapters.length; ++i) {
      if (p.chapters[i].fragment == fragment) {
        return Math.round(p.chapters[i].percent * p.clientDimensions.pages) + 1;
      }
    }
    return null;
  }


  // A shortcut to p.clientDimensions.pages.
  //
  function lastPageNumber() {
    return p.clientDimensions ? p.clientDimensions.pages : null;
  }


  API.currentlyApplyingTo = currentlyApplyingTo;
  API.applyTo = applyTo;
  API.updateDimensions = updateDimensions;
  API.chapterForPage = chapterForPage;
  API.pageForChapter = pageForChapter;
  API.lastPageNumber = lastPageNumber;

  return API;
}

Monocle.pieceLoaded('component');

// imdb-slice: prunes IMDb's non-commercial datasets to a browser-sized JSON
// of movie ratings, keyed the same way the front-end keys films —
// normalized-title|year — so the client can join with zero extra API calls.
//
// Run weekly by .github/workflows/imdb-slice.yml; output data/imdb-slice.json.
//
//	go run ./pipeline [-min-votes 2500] [-out data/imdb-slice.json]
package main

import (
	"bufio"
	"compress/gzip"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
)

const (
	ratingsURL = "https://datasets.imdbws.com/title.ratings.tsv.gz"
	basicsURL  = "https://datasets.imdbws.com/title.basics.tsv.gz"
)

type rated struct {
	Rating float64
	Votes  int
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// normTitle mirrors lib/recs.js exactly: lowercase, collapse every
// non-alphanumeric run to one space, trim.
func normTitle(t string) string {
	return strings.TrimSpace(nonAlnum.ReplaceAllString(strings.ToLower(t), " "))
}

func openTSV(url string) (io.ReadCloser, *gzip.Reader, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		return nil, nil, fmt.Errorf("%s: HTTP %d", url, resp.StatusCode)
	}
	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		resp.Body.Close()
		return nil, nil, err
	}
	return resp.Body, gz, nil
}

func main() {
	minVotes := flag.Int("min-votes", 2500, "keep films with at least this many votes")
	out := flag.String("out", "data/imdb-slice.json", "output path")
	flag.Parse()

	// pass 1: ratings — small file, builds the tconst allowlist
	log.Printf("downloading %s", ratingsURL)
	body, gz, err := openTSV(ratingsURL)
	if err != nil {
		log.Fatal(err)
	}
	ratings := make(map[string]rated, 1<<19)
	sc := bufio.NewScanner(gz)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	sc.Scan() // header
	for sc.Scan() {
		f := strings.Split(sc.Text(), "\t")
		if len(f) < 3 {
			continue
		}
		votes, _ := strconv.Atoi(f[2])
		if votes < *minVotes {
			continue
		}
		rating, _ := strconv.ParseFloat(f[1], 64)
		ratings[f[0]] = rated{rating, votes}
	}
	gz.Close()
	body.Close()
	log.Printf("ratings: %d titles at ≥%d votes", len(ratings), *minVotes)

	// pass 2: basics — big file, streamed; keep movies on the allowlist and
	// key them by normTitle|year, highest vote count winning collisions
	log.Printf("downloading %s (large, streamed)", basicsURL)
	body, gz, err = openTSV(basicsURL)
	if err != nil {
		log.Fatal(err)
	}
	slice := make(map[string][2]float64, len(ratings))
	sc = bufio.NewScanner(gz)
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	sc.Scan() // header: tconst titleType primaryTitle originalTitle isAdult startYear ...
	kept := 0
	for sc.Scan() {
		line := sc.Text()
		f := strings.SplitN(line, "\t", 7)
		if len(f) < 6 || (f[1] != "movie" && f[1] != "tvMovie") {
			continue
		}
		r, ok := ratings[f[0]]
		if !ok {
			continue
		}
		year := f[5]
		if year == `\N` {
			continue
		}
		for _, title := range dedupe(f[2], f[3]) {
			key := normTitle(title) + "|" + year
			if prev, exists := slice[key]; exists && int(prev[1]) >= r.Votes {
				continue
			}
			slice[key] = [2]float64{r.Rating, float64(r.Votes)}
		}
		kept++
	}
	if err := sc.Err(); err != nil {
		log.Fatal(err)
	}
	gz.Close()
	body.Close()

	data, err := json.Marshal(slice)
	if err != nil {
		log.Fatal(err)
	}
	if err := os.WriteFile(*out, data, 0o644); err != nil {
		log.Fatal(err)
	}
	log.Printf("%s — %d films (%d keys), %d KB", *out, kept, len(slice), len(data)/1024)
}

// primary and original title both get keys (a viewer logs "Seven Samurai",
// IMDb's original title is "Shichinin no Samurai")
func dedupe(a, b string) []string {
	if a == b || b == `\N` {
		return []string{a}
	}
	return []string{a, b}
}
